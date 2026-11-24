import { NextRequest, NextResponse } from 'next/server';
import { PROTOCOL_X_HANDLES, SITE_URL } from '@/lib/constants';
import { signOAuth1, type OAuth1Credentials } from '@/lib/x-oauth';

const OG_IMAGE_URL = `${SITE_URL}/api/og?v=20261112a`;
const X_API_BASE = 'https://api.x.com';
const DEFAULT_EXPECTED_USERNAME = 'ShieldedSol';
const MAX_TWEET_IMAGE_BYTES = 5 * 1024 * 1024;

function fmtShareUsd(n: number): string {
  if (!n || n <= 0) return '$--';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}

async function fetchTVL() {
  let tvlFormatted = '$--';
  let change = '';
  let topBlock = '';
  let tags = '@shieldedsol';

  try {
    const apiRes = await fetch(`${SITE_URL}/api/protocols`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const data = await apiRes.json();
    const totalTvl = Number(data?.totalTvl) || 0;
    tvlFormatted = fmtShareUsd(totalTvl);

    const live = (data?.protocols || [])
      .filter(
        (p: { kind?: string; status?: string; tvl?: number; name?: string }) =>
          p.kind !== 'infra' && p.status === 'live' && (p.tvl || 0) > 0
      )
      .sort(
        (a: { tvl?: number }, b: { tvl?: number }) =>
          (b.tvl || 0) - (a.tvl || 0)
      );

    topBlock = live
      .slice(0, 3)
      .map(
        (p: { name?: string; tvl?: number }) =>
          `${p.name}  ${fmtShareUsd(p.tvl || 0)}`
      )
      .join('\n');

    const lead = live[0]?.name ? PROTOCOL_X_HANDLES[live[0].name] : null;
    tags = ['@shieldedsol', lead ? `@${lead}` : null]
      .filter(Boolean)
      .join(' ');
  } catch (e) {
    console.error('Failed to fetch from protocols API:', e);
  }

  try {
    const histRes = await fetch(`${SITE_URL}/api/v1/history/tvl?range=24h`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (histRes.ok) {
      const hist = await histRes.json();
      const pts = Array.isArray(hist?.history)
        ? hist.history
        : Array.isArray(hist?.data)
          ? hist.data
          : [];
      if (pts.length >= 2) {
        const first =
          Number(pts[0]?.totalTvlUsd ?? pts[0]?.totalTvl ?? pts[0]?.tvl) || 0;
        const last =
          Number(
            pts[pts.length - 1]?.totalTvlUsd ??
              pts[pts.length - 1]?.totalTvl ??
              pts[pts.length - 1]?.tvl
          ) || 0;
        if (first > 0 && last > 0) {
          const pct = ((last - first) / first) * 100;
          if (Math.abs(pct) <= 80) {
            const arrow = pct >= 0 ? '↑' : '↓';
            change = `${arrow}${Math.abs(pct).toFixed(1)}%`;
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to fetch 24h change:', e);
  }

  return { tvlFormatted, change, topBlock, tags };
}

type TweetStage = 'account_check' | 'og_fetch' | 'upload_media' | 'create_tweet';

class TweetApiError extends Error {
  status: number;
  stage?: TweetStage;
  upstreamStatus?: number;
  upstreamMessage?: string;
  missing?: string[];
  expected?: string;
  actual?: string;

  constructor(
    message: string,
    status: number,
    extra?: {
      stage?: TweetStage;
      upstreamStatus?: number;
      upstreamMessage?: string;
      missing?: string[];
      expected?: string;
      actual?: string;
    }
  ) {
    super(message);
    this.name = 'TweetApiError';
    this.status = status;
    this.stage = extra?.stage;
    this.upstreamStatus = extra?.upstreamStatus;
    this.upstreamMessage = extra?.upstreamMessage;
    this.missing = extra?.missing;
    this.expected = extra?.expected;
    this.actual = extra?.actual;
  }
}

function tweetErrorStatus(error: unknown): number {
  if (error instanceof TweetApiError) {
    if (error.status === 403) return 403;
    if (error.status === 429) return 429;
    if (error.status === 503) return 503;
    return 502;
  }
  return 500;
}

function redactSecrets(value: string, secrets: string[]): string {
  let out = value;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      out = out.split(secret).join('[redacted]');
    }
  }
  return out.slice(0, 500);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { message: text.slice(0, 500) };
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function upstreamMessageOf(
  data: Record<string, unknown>,
  secrets: string[]
): string {
  const errors = data.errors;
  let raw: unknown =
    data.detail ?? data.title ?? data.message ?? data.msg ?? data.error;
  if (
    raw == null &&
    Array.isArray(errors) &&
    errors[0] &&
    typeof errors[0] === 'object'
  ) {
    const first = errors[0] as Record<string, unknown>;
    raw = first.detail ?? first.message ?? first.title;
  }
  const text =
    typeof raw === 'string' ? raw : raw != null ? JSON.stringify(raw) : '';
  return redactSecrets(text, secrets);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type XAccount = { id: string; username: string; name?: string };

function loadXCredentials(): {
  credentials: OAuth1Credentials;
  secrets: string[];
  expectedUsername: string;
} {
  const consumerKey = process.env.X_API_KEY?.trim();
  const consumerSecret = process.env.X_API_SECRET?.trim();
  const token = process.env.X_ACCESS_TOKEN?.trim();
  const tokenSecret = process.env.X_ACCESS_TOKEN_SECRET?.trim();

  const missing: string[] = [];
  if (!consumerKey) missing.push('X_API_KEY');
  if (!consumerSecret) missing.push('X_API_SECRET');
  if (!token) missing.push('X_ACCESS_TOKEN');
  if (!tokenSecret) missing.push('X_ACCESS_TOKEN_SECRET');
  if (missing.length > 0) {
    throw new TweetApiError(`Missing credentials: ${missing.join(', ')}`, 503, {
      missing,
    });
  }

  const expectedUsername = (
    process.env.X_EXPECTED_USERNAME?.trim() || DEFAULT_EXPECTED_USERNAME
  ).replace(/^@/, '');

  return {
    credentials: {
      consumerKey: consumerKey!,
      consumerSecret: consumerSecret!,
      token: token!,
      tokenSecret: tokenSecret!,
    },
    secrets: [consumerKey!, consumerSecret!, token!, tokenSecret!],
    expectedUsername,
  };
}

async function xApiFetch(
  credentials: OAuth1Credentials,
  method: string,
  url: string,
  options?: { json?: unknown; signal?: AbortSignal }
): Promise<Response> {
  const signed = await signOAuth1({ method, url, credentials });
  const headers: Record<string, string> = {
    Authorization: signed.authorization,
    Accept: 'application/json',
  };
  let body: string | undefined;
  if (options?.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  return fetch(url, {
    method,
    headers,
    body,
    signal: options?.signal,
    cache: 'no-store',
  });
}

async function getAuthenticatedAccount(
  credentials: OAuth1Credentials,
  secrets: string[]
): Promise<XAccount> {
  let response: Response;
  try {
    response = await xApiFetch(
      credentials,
      'GET',
      `${X_API_BASE}/2/users/me`,
      { signal: AbortSignal.timeout(15_000) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new TweetApiError(
      `Account check request failed: ${redactSecrets(message, secrets)}`,
      502,
      {
        stage: 'account_check',
        upstreamMessage: redactSecrets(message, secrets),
      }
    );
  }

  const json = await readJson(response);
  if (!response.ok) {
    throw new TweetApiError('X API account check failed', 502, {
      stage: 'account_check',
      upstreamStatus: response.status,
      upstreamMessage: upstreamMessageOf(json, secrets),
    });
  }

  const data =
    json.data && typeof json.data === 'object' && !Array.isArray(json.data)
      ? (json.data as Record<string, unknown>)
      : undefined;
  const username = typeof data?.username === 'string' ? data.username : '';
  const id = typeof data?.id === 'string' ? data.id : '';
  if (!username || !id) {
    throw new TweetApiError('X API account check returned no user', 502, {
      stage: 'account_check',
      upstreamStatus: response.status,
    });
  }

  return {
    id,
    username,
    name: typeof data?.name === 'string' ? data.name : undefined,
  };
}

function assertExpectedAccount(
  account: XAccount,
  expectedUsername: string
): void {
  if (account.username.toLowerCase() !== expectedUsername.toLowerCase()) {
    throw new TweetApiError(
      `Authenticated X account @${account.username} does not match expected @${expectedUsername}`,
      403,
      {
        stage: 'account_check',
        expected: expectedUsername,
        actual: account.username,
      }
    );
  }
}

async function fetchOgImage(
  secrets: string[]
): Promise<{ bytes: Uint8Array; status: number }> {
  let ogRes: Response;
  try {
    ogRes = await fetch(OG_IMAGE_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new TweetApiError(`OG image request failed: ${message}`, 502, {
      stage: 'og_fetch',
      upstreamMessage: redactSecrets(message, secrets),
    });
  }
  if (!ogRes.ok) {
    throw new TweetApiError(`OG image fetch failed: ${ogRes.status}`, 502, {
      stage: 'og_fetch',
      upstreamStatus: ogRes.status,
    });
  }
  const bytes = new Uint8Array(await ogRes.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new TweetApiError('OG image was empty', 502, { stage: 'og_fetch' });
  }
  return { bytes, status: ogRes.status };
}

async function uploadTweetImage(
  credentials: OAuth1Credentials,
  secrets: string[],
  bytes: Uint8Array
): Promise<string> {
  if (bytes.byteLength > MAX_TWEET_IMAGE_BYTES) {
    throw new TweetApiError(
      `OG image is too large for tweet_image (${bytes.byteLength} bytes)`,
      502,
      { stage: 'upload_media' }
    );
  }

  // Official simple upload for images <5MB: JSON body with base64 `media`.
  // media_type is not a field on POST /2/media/upload (additionalProperties: false).
  // OAuth 1.0a signs only query + oauth_* params — JSON body is excluded.
  // https://docs.x.com/x-api/media/upload-media
  let uploadRes: Response;
  try {
    uploadRes = await xApiFetch(
      credentials,
      'POST',
      `${X_API_BASE}/2/media/upload`,
      {
        json: {
          media: bytesToBase64(bytes),
          media_category: 'tweet_image',
        },
        signal: AbortSignal.timeout(20_000),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new TweetApiError(`Media upload request failed: ${message}`, 502, {
      stage: 'upload_media',
      upstreamMessage: redactSecrets(message, secrets),
    });
  }

  const uploadJson = await readJson(uploadRes);
  if (uploadRes.status === 429) {
    throw new TweetApiError('X API rate limited during media upload', 429, {
      stage: 'upload_media',
      upstreamStatus: 429,
      upstreamMessage: upstreamMessageOf(uploadJson, secrets),
    });
  }

  const data =
    uploadJson.data &&
    typeof uploadJson.data === 'object' &&
    !Array.isArray(uploadJson.data)
      ? (uploadJson.data as Record<string, unknown>)
      : undefined;
  const mediaId = typeof data?.id === 'string' ? data.id : '';
  if (!uploadRes.ok || !mediaId) {
    throw new TweetApiError('X API media upload failed', 502, {
      stage: 'upload_media',
      upstreamStatus: uploadRes.status,
      upstreamMessage: upstreamMessageOf(uploadJson, secrets),
    });
  }
  return mediaId;
}

async function createTweet(
  credentials: OAuth1Credentials,
  secrets: string[],
  text: string,
  mediaId: string
): Promise<{ tweetId: string; result: Record<string, unknown> }> {
  // https://docs.x.com/x-api/posts/create-post — success is HTTP 201, data.id
  let createRes: Response;
  try {
    createRes = await xApiFetch(credentials, 'POST', `${X_API_BASE}/2/tweets`, {
      json: {
        text,
        media: { media_ids: [mediaId] },
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new TweetApiError(`Create tweet request failed: ${message}`, 502, {
      stage: 'create_tweet',
      upstreamMessage: redactSecrets(message, secrets),
    });
  }

  const createJson = await readJson(createRes);
  if (createRes.status === 429) {
    throw new TweetApiError('X API rate limited during create tweet', 429, {
      stage: 'create_tweet',
      upstreamStatus: 429,
      upstreamMessage: upstreamMessageOf(createJson, secrets),
    });
  }

  const data =
    createJson.data &&
    typeof createJson.data === 'object' &&
    !Array.isArray(createJson.data)
      ? (createJson.data as Record<string, unknown>)
      : undefined;
  const tweetId = typeof data?.id === 'string' ? data.id : '';
  if ((!createRes.ok && createRes.status !== 201) || !tweetId) {
    throw new TweetApiError('X API create tweet failed', 502, {
      stage: 'create_tweet',
      upstreamStatus: createRes.status,
      upstreamMessage: upstreamMessageOf(createJson, secrets),
    });
  }

  return { tweetId, result: createJson };
}

function buildTweetText(
  tvlFormatted: string,
  change: string,
  topBlock: string,
  tags: string
): string {
  return [
    `Solana privacy pool TVL: ${tvlFormatted}${
      change ? ` (${change} 24h)` : ''
    }`,
    topBlock || null,
    tags,
    'shieldedsol.com',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dry_run') === '1';

  try {
    const { credentials, secrets, expectedUsername } = loadXCredentials();
    const account = await getAuthenticatedAccount(credentials, secrets);
    assertExpectedAccount(account, expectedUsername);

    const { tvlFormatted, change, topBlock, tags } = await fetchTVL();
    const tweetText = buildTweetText(tvlFormatted, change, topBlock, tags);

    if (dryRun) {
      const og = await fetchOgImage(secrets);
      return NextResponse.json({
        ok: true,
        dryRun: true,
        account,
        tweetText,
        ogStatus: og.status,
        ogBytes: og.bytes.byteLength,
      });
    }

    const og = await fetchOgImage(secrets);
    const mediaId = await uploadTweetImage(credentials, secrets, og.bytes);
    const posted = await createTweet(credentials, secrets, tweetText, mediaId);
    const tweetUrl = `https://x.com/${account.username}/status/${posted.tweetId}`;

    return NextResponse.json({
      success: true,
      ok: true,
      tweetId: posted.tweetId,
      tweetUrl,
      account,
      mediaAttached: true,
      tweetText,
      tweet: tweetText,
      result: posted.result,
    });
  } catch (error) {
    console.error('Failed to post tweet:', error);
    const body: {
      error: string;
      message: string;
      stage?: TweetStage;
      upstreamStatus?: number;
      upstreamMessage?: string;
      missing?: string[];
      expected?: string;
      actual?: string;
    } = {
      error: dryRun ? 'Dry run failed' : 'Failed to post tweet',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    if (error instanceof TweetApiError) {
      if (error.stage) body.stage = error.stage;
      if (error.upstreamStatus != null) body.upstreamStatus = error.upstreamStatus;
      if (error.upstreamMessage) body.upstreamMessage = error.upstreamMessage;
      if (error.missing) body.missing = error.missing;
      if (error.expected) body.expected = error.expected;
      if (error.actual) body.actual = error.actual;
    }
    return NextResponse.json(body, { status: tweetErrorStatus(error) });
  }
}
