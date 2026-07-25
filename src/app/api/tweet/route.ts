import { NextRequest, NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';

async function fetchTVL() {
  let tvlFormatted = '$--';
  let change = '';

  try {
    const apiRes = await fetch(`${SITE_URL}/api/protocols`);
    const data = await apiRes.json();
    const totalTvl = data?.totalTvl || 0;

    if (totalTvl >= 1e6) {
      tvlFormatted = '$' + (totalTvl / 1e6).toFixed(2) + 'M';
    } else if (totalTvl >= 1e3) {
      tvlFormatted = '$' + (totalTvl / 1e3).toFixed(2) + 'K';
    } else {
      tvlFormatted = '$' + totalTvl.toFixed(2);
    }
  } catch (e) {
    console.error('Failed to fetch from protocols API:', e);
  }

  try {
    const llamaRes = await fetch('https://api.llama.fi/protocol/privacy-cash');
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
        const arrow = pct >= 0 ? '↑' : '↓';
        change = `${arrow}${Math.abs(pct).toFixed(1)}%`;
      }
    }
  } catch (e) {
    console.error('Failed to fetch 24h change:', e);
  }

  return { tvlFormatted, change };
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
    media: [{ url: `${SITE_URL}/api/og` }],
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
    const { tvlFormatted, change } = await fetchTVL();

    const tweetText = `Solana Privacy Pools TVL: ${tvlFormatted}${change ? ` (${change} 24h)` : ''}

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
