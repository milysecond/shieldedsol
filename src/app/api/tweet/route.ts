import { NextRequest, NextResponse } from 'next/server';
import { PROTOCOL_X_HANDLES, SITE_URL } from '@/lib/constants';

const OG_IMAGE_URL = `${SITE_URL}/api/og?v=20261112a`;
const TWITTERAPI_BASE = 'https://api.twitterapi.io';
const QPS_DELAY_MS = 6_000;

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

type TweetStage = 'og_fetch' | 'upload_media' | 'create_tweet';

class TweetApiError extends Error {
  status: number;
  stage?: TweetStage;
  upstreamStatus?: number;
  upstreamMessage?: string;
  missing?: string[];

  constructor(
    message: string,
    status: number,
    extra?: {
      stage?: TweetStage;
      upstreamStatus?: number;
      upstreamMessage?: string;
      missing?: string[];
    }
  ) {
    super(message);
    this.name = 'TweetApiError';
    this.status = status;
    this.stage = extra?.stage;
    this.upstreamStatus = extra?.upstreamStatus;
    this.upstreamMessage = extra?.upstreamMessage;
    this.missing = extra?.missing;
  }
}

function tweetErrorStatus(error: unknown): number {
  if (error instanceof TweetApiError) {
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
  out = out.replace(/https?:\/\/[^/\s'"]+:[^/\s'"]+@[^/\s'"]+/gi, '[redacted-proxy]');
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
  const raw = data.message ?? data.msg ?? data.error ?? data.detail;
  const text =
    typeof raw === 'string'
      ? raw
      : raw != null
        ? JSON.stringify(raw)
        : '';
  return redactSecrets(text, secrets);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postTweet(text: string) {
  const apiKey = process.env.TWITTERAPI_IO_KEY?.trim();
  const rawProxy = process.env.TWEET_PROXY?.trim();
  const prebuiltCookies = process.env.TWITTER_LOGIN_COOKIES?.trim();
  const authToken = process.env.TWITTER_AUTH_TOKEN?.trim();
  const ct0 = process.env.TWITTER_CT0?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push('TWITTERAPI_IO_KEY');
  if (!rawProxy) missing.push('TWEET_PROXY');
  if (!prebuiltCookies) {
    if (!authToken) missing.push('TWITTER_AUTH_TOKEN');
    if (!ct0) missing.push('TWITTER_CT0');
  }
  if (missing.length > 0) {
    throw new TweetApiError(
      `Missing credentials: ${missing.join(', ')}`,
      503,
      { missing }
    );
  }

  const loginCookies =
    prebuiltCookies ||
    btoa(JSON.stringify({ auth_token: authToken!.trim(), ct0: ct0!.trim() }));
  const proxy = rawProxy!.includes('://') ? rawProxy! : `http://${rawProxy}`;
  const secrets = [apiKey!, authToken || '', ct0 || '', loginCookies, proxy].filter(
    Boolean
  );

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
    throw new TweetApiError(
      `OG image fetch failed: ${ogRes.status}`,
      502,
      { stage: 'og_fetch', upstreamStatus: ogRes.status }
    );
  }
  const ogBytes = new Uint8Array(await ogRes.arrayBuffer());
  if (ogBytes.byteLength === 0) {
    throw new TweetApiError('OG image was empty', 502, { stage: 'og_fetch' });
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([ogBytes], { type: 'image/png' }),
    'shieldedsol-tvl.png'
  );
  form.append('proxy', proxy);
  form.append('login_cookies', loginCookies);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${TWITTERAPI_BASE}/twitter/upload_media_v2`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey! },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new TweetApiError(`Media upload request failed: ${message}`, 502, {
      stage: 'upload_media',
      upstreamMessage: redactSecrets(message, secrets),
    });
  }

  const uploadJson = await readJson(uploadRes);
  if (uploadRes.status === 429) {
    throw new TweetApiError('twitterapi.io rate limited during media upload', 429, {
      stage: 'upload_media',
      upstreamStatus: 429,
      upstreamMessage: upstreamMessageOf(uploadJson, secrets),
    });
  }
  const uploadStatus = uploadJson.status;
  const mediaId =
    typeof uploadJson.media_id === 'string' ? uploadJson.media_id : '';
  if (!uploadRes.ok || uploadStatus !== 'success' || !mediaId) {
    throw new TweetApiError('twitterapi.io media upload failed', 502, {
      stage: 'upload_media',
      upstreamStatus: uploadRes.status,
      upstreamMessage: upstreamMessageOf(uploadJson, secrets),
    });
  }

  await delay(QPS_DELAY_MS);

  const createBody = JSON.stringify({
    login_cookies: loginCookies,
    tweet_text: text,
    proxy,
    media_ids: [mediaId],
  });

  async function createTweet(): Promise<Response> {
    return fetch(`${TWITTERAPI_BASE}/twitter/create_tweet_v2`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey!,
        'Content-Type': 'application/json',
      },
      body: createBody,
      signal: AbortSignal.timeout(20_000),
    });
  }

  let createRes: Response;
  try {
    createRes = await createTweet();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new TweetApiError(`Create tweet request failed: ${message}`, 502, {
      stage: 'create_tweet',
      upstreamMessage: redactSecrets(message, secrets),
    });
  }

  if (createRes.status === 429) {
    await delay(QPS_DELAY_MS);
    try {
      createRes = await createTweet();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new TweetApiError(
        `Create tweet retry request failed: ${message}`,
        502,
        {
          stage: 'create_tweet',
          upstreamMessage: redactSecrets(message, secrets),
        }
      );
    }
    if (createRes.status === 429) {
      const retryJson = await readJson(createRes);
      throw new TweetApiError('twitterapi.io rate limited during create tweet', 429, {
        stage: 'create_tweet',
        upstreamStatus: 429,
        upstreamMessage: upstreamMessageOf(retryJson, secrets),
      });
    }
  }

  const createJson = await readJson(createRes);
  const createStatus = createJson.status;
  const tweetId =
    typeof createJson.tweet_id === 'string' ? createJson.tweet_id : '';
  if (!createRes.ok || createStatus !== 'success' || !tweetId) {
    throw new TweetApiError('twitterapi.io create tweet failed', 502, {
      stage: 'create_tweet',
      upstreamStatus: createRes.status,
      upstreamMessage: upstreamMessageOf(createJson, secrets),
    });
  }

  return {
    tweetId,
    tweetUrl: `https://x.com/ShieldedSol/status/${tweetId}`,
    result: createJson,
  };
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tvlFormatted, change, topBlock, tags } = await fetchTVL();

    const tweetText = [
      `Solana privacy pool TVL: ${tvlFormatted}${
        change ? ` (${change} 24h)` : ''
      }`,
      topBlock || null,
      tags,
      'shieldedsol.com',
    ]
      .filter(Boolean)
      .join('\n\n');

    const posted = await postTweet(tweetText);

    return NextResponse.json({
      success: true,
      tweet: tweetText,
      tweetId: posted.tweetId,
      tweetUrl: posted.tweetUrl,
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
    } = {
      error: 'Failed to post tweet',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    if (error instanceof TweetApiError) {
      if (error.stage) body.stage = error.stage;
      if (error.upstreamStatus != null) body.upstreamStatus = error.upstreamStatus;
      if (error.upstreamMessage) body.upstreamMessage = error.upstreamMessage;
      if (error.missing) body.missing = error.missing;
    }
    return NextResponse.json(body, { status: tweetErrorStatus(error) });
  }
}
