import { NextRequest, NextResponse } from 'next/server';
import { PROTOCOL_X_HANDLES, SITE_URL } from '@/lib/constants';

function fmtUsd(n: number): string {
  if (!n || n <= 0) return '$--';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

async function fetchTVL() {
  let tvlFormatted = '$--';
  let change = '';
  let topLine = '';
  let tags = '@shieldedsol';

  try {
    const apiRes = await fetch(`${SITE_URL}/api/protocols`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const data = await apiRes.json();
    const totalTvl = Number(data?.totalTvl) || 0;
    tvlFormatted = fmtUsd(totalTvl);

    const live = (data?.protocols || [])
      .filter(
        (p: { kind?: string; status?: string; tvl?: number; name?: string }) =>
          p.kind !== 'infra' && p.status === 'live' && (p.tvl || 0) > 0
      )
      .sort(
        (a: { tvl?: number }, b: { tvl?: number }) =>
          (b.tvl || 0) - (a.tvl || 0)
      );

    topLine = live
      .slice(0, 3)
      .map(
        (p: { name?: string; tvl?: number }) =>
          `${p.name} ${fmtUsd(p.tvl || 0)}`
      )
      .join(' · ');

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

  return { tvlFormatted, change, topLine, tags };
}

async function postTweet(text: string) {
  const apiKey = process.env.TWEETAPI;
  const authToken = process.env.TWITTER_AUTH_TOKEN;

  if (!apiKey || !authToken) {
    throw new Error('TweetAPI credentials not configured');
  }

  const body = {
    authToken,
    text,
    proxy: '142.111.48.253:7030@khdrutfi:6k4w4qxpoqep',
    media: [{ url: `${SITE_URL}/api/og?v=20260820` }],
  };

  const response = await fetch(
    'https://api.tweetapi.com/tw-v2/interaction/create-post-with-media',
    {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TweetAPI error: ${response.status} - ${errorBody}`);
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
    const { tvlFormatted, change, topLine, tags } = await fetchTVL();

    // Short, 3rd person, no hashtags
    const tweetText = [
      `Solana privacy pool TVL is ${tvlFormatted}${
        change ? ` (${change} 24h)` : ''
      }.`,
      topLine || null,
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
      { status: 500 }
    );
  }
}
