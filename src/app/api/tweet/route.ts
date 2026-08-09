import { NextRequest, NextResponse } from 'next/server';
import { PROTOCOL_X_HANDLES, SITE_URL } from '@/lib/constants';

async function fetchTVL() {
  let tvlFormatted = '$--';
  let change = '';
  let tags: string[] = ['@shieldedsol'];

  try {
    const apiRes = await fetch(`${SITE_URL}/api/protocols`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const data = await apiRes.json();
    const totalTvl = data?.totalTvl || 0;

    if (totalTvl >= 1e6) {
      tvlFormatted = '$' + (totalTvl / 1e6).toFixed(2) + 'M';
    } else if (totalTvl >= 1e3) {
      tvlFormatted = '$' + (totalTvl / 1e3).toFixed(2) + 'K';
    } else {
      tvlFormatted = '$' + totalTvl.toFixed(2);
    }

    const live = (data?.protocols || []).filter(
      (p: { kind?: string; status?: string; tvl?: number; name?: string }) =>
        p.kind !== 'infra' && p.status === 'live' && (p.tvl || 0) > 0
    );
    const handles = live
      .slice(0, 5)
      .map((p: { name?: string }) =>
        p.name ? PROTOCOL_X_HANDLES[p.name] : null
      )
      .filter(Boolean)
      .map((h: string) => `@${h}`);
    tags = Array.from(new Set([...handles, '@shieldedsol']));
  } catch (e) {
    console.error('Failed to fetch from protocols API:', e);
  }

  try {
    const llamaRes = await fetch('https://api.llama.fi/protocol/privacy-cash', {
      signal: AbortSignal.timeout(8000),
    });
    const llamaData = await llamaRes.json();
    const history =
      llamaData?.chainTvls?.Solana?.tvl || llamaData?.tvl || [];
    if (history.length >= 2) {
      const current =
        history[history.length - 1]?.totalLiquidityUSD || 0;
      const yesterday =
        history[history.length - 2]?.totalLiquidityUSD || 0;
      if (yesterday > 0) {
        const pct = ((current - yesterday) / yesterday) * 100;
        if (Math.abs(pct) <= 80) {
          const arrow = pct >= 0 ? '↑' : '↓';
          change = `${arrow}${Math.abs(pct).toFixed(1)}%`;
        }
      }
    }
  } catch (e) {
    console.error('Failed to fetch 24h change:', e);
  }

  return { tvlFormatted, change, tags };
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
    media: [{ url: `${SITE_URL}/api/og?v=20260805b` }],
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
    const { tvlFormatted, change, tags } = await fetchTVL();

    // 3rd person, no hashtags; tag live projects
    const tweetText = `Solana privacy pool TVL is ${tvlFormatted}${
      change ? ` (${change} 24h)` : ''
    }.

${tags.join(' ')}

Track live at shieldedsol.com`;

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
