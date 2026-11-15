import { NextRequest, NextResponse } from 'next/server';
import { PROTOCOL_X_HANDLES, SITE_URL } from '@/lib/constants';

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

class TweetApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TweetApiError';
    this.status = status;
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

async function postTweet(text: string) {
  const apiKey = process.env.TWEETAPI;
  const authToken = process.env.TWITTER_AUTH_TOKEN;
  const proxy = process.env.TWEET_PROXY;

  if (!apiKey || !authToken) {
    throw new TweetApiError('TweetAPI credentials not configured', 503);
  }

  const body: {
    authToken: string;
    text: string;
    media: { url: string }[];
    proxy?: string;
  } = {
    authToken,
    text,
    media: [{ url: `${SITE_URL}/api/og?v=20261112a` }],
  };
  if (proxy) body.proxy = proxy;

  let response: Response;
  try {
    response = await fetch(
      'https://api.tweetapi.com/tw-v2/interaction/create-post-with-media',
      {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new TweetApiError(`TweetAPI request failed: ${message}`, 502);
  }

  if (!response.ok) {
    const errorBody = (await response.text()).slice(0, 500);
    throw new TweetApiError(
      `TweetAPI error: ${response.status} - ${errorBody}`,
      response.status
    );
  }

  return response.json();
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

    const result = await postTweet(tweetText);

    return NextResponse.json({
      success: true,
      tweet: tweetText,
      result,
    });
  } catch (error) {
    console.error('Failed to post tweet:', error);
    return NextResponse.json(
      {
        error: 'Failed to post tweet',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: tweetErrorStatus(error) }
    );
  }
}
