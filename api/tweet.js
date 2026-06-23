export const config = {
  maxDuration: 30,
};

async function fetchTVL() {
  let tvlFormatted = '$--';
  let change = '';
  let totalTvl = 0;

  // Fetch from our own protocols API
  try {
    const apiRes = await fetch('https://www.shieldedsol.com/api/protocols');
    const data = await apiRes.json();
    totalTvl = data?.totalTvl || 0;

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

  // Get 24h change from DeFiLlama
  try {
    const llamaRes = await fetch('https://api.llama.fi/protocol/privacy-cash');
    const llamaData = await llamaRes.json();
    const history = llamaData?.chainTvls?.Solana?.tvl || llamaData?.tvl || [];
    if (history.length >= 2) {
      const current = history[history.length - 1]?.totalLiquidityUSD || 0;
      const yesterday = history[history.length - 2]?.totalLiquidityUSD || 0;
      if (yesterday > 0) {
        const pct = ((current - yesterday) / yesterday) * 100;
        const arrow = pct >= 0 ? '↑' : '↓';
        change = `${arrow}${Math.abs(pct).toFixed(1)}%`;
      }
    }
  } catch (e) {
    console.error('Failed to fetch 24h change:', e);
  }

  return { tvlFormatted, change, totalTvl };
}

async function fetchOgImage() {
  // Fetch our dynamic OG image
  const res = await fetch('https://shieldedsol.com/api/og');
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

async function uploadMedia(base64Image, apiKey, authToken) {
  const body = {
    authToken: authToken,
    media_data: base64Image,
    media_type: 'image/png',
    proxy: '142.111.48.253:7030@khdrutfi:6k4w4qxpoqep'
  };

  const response = await fetch('https://api.tweetapi.com/tw-v2/media/upload', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Media upload error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  return data.media_id_string || data.media_id;
}

async function postTweet(text, withMedia = false) {
  const apiKey = process.env.TWEETAPI;
  const authToken = process.env.TWITTER_AUTH_TOKEN;

  if (!apiKey || !authToken) {
    throw new Error('TweetAPI credentials not configured');
  }

  const body = {
    authToken: authToken,
    text: text,
    proxy: '142.111.48.253:7030@khdrutfi:6k4w4qxpoqep'
  };

  // Use different endpoint for media tweets
  let endpoint = 'https://api.tweetapi.com/tw-v2/interaction/create-post';

  if (withMedia) {
    endpoint = 'https://api.tweetapi.com/tw-v2/interaction/create-post-with-media';
    body.media = [{ url: 'https://shieldedsol.com/api/og' }];
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TweetAPI error: ${response.status} - ${errorBody}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  // Verify this is a cron request or has proper authorization
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  // Allow Vercel cron or manual trigger with secret
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { tvlFormatted, change } = await fetchTVL();

    const tweetText = `Solana Privacy Pools TVL: ${tvlFormatted}${change ? ` (${change} 24h)` : ''}

Track live at shieldedsol.com`;

    // Post tweet with OG image
    const result = await postTweet(tweetText, true);

    console.log('Tweet posted successfully:', result);
    return res.status(200).json({
      success: true,
      tweet: tweetText,
      result: result
    });
  } catch (error) {
    console.error('Failed to post tweet:', error);
    return res.status(500).json({
      error: 'Failed to post tweet',
      message: error.message
    });
  }
}
