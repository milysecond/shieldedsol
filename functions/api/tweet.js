export async function onRequest({ request, env }) {
  // Auth check for cron
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch TVL from own API
    const apiRes = await fetch('https://shieldedsol.com/api/protocols');
    const data = await apiRes.json();
    const totalTvl = data?.totalTvl || 0;

    let tvlFormatted = '$--';
    if (totalTvl >= 1e6) tvlFormatted = '$' + (totalTvl / 1e6).toFixed(2) + 'M';
    else if (totalTvl >= 1e3) tvlFormatted = '$' + (totalTvl / 1e3).toFixed(2) + 'K';
    else if (totalTvl > 0) tvlFormatted = '$' + totalTvl.toFixed(2);

    // Get 24h change from DeFiLlama
    let change = '';
    try {
      const llamaRes = await fetch('https://api.llama.fi/protocol/privacy-cash');
      const llamaData = await llamaRes.json();
      const history = llamaData?.chainTvls?.Solana?.tvl || llamaData?.tvl || [];
      if (history.length >= 2) {
        const current = history[history.length - 1]?.totalLiquidityUSD || 0;
        const yesterday = history[history.length - 2]?.totalLiquidityUSD || 0;
        if (yesterday > 0) {
          const pct = ((current - yesterday) / yesterday) * 100;
          change = `${pct >= 0 ? '↑' : '↓'}${Math.abs(pct).toFixed(1)}%`;
        }
      }
    } catch (e) {}

    const tweetText = [
      `🛡️ Shielded Solana TVL: ${tvlFormatted}${change ? ` ${change} 24h` : ''}`,
      '',
      'Private DeFi on Solana. Your transactions, your business.',
      'shieldedsol.com'
    ].join('\n');

    // Post tweet via Twitter API v2
    const tweetRes = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.TWITTER_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: tweetText }),
    });

    const tweetData = await tweetRes.json();
    if (!tweetRes.ok) return Response.json({ error: 'Tweet failed', details: tweetData }, { status: 502 });
    return Response.json({ ok: true, tweet: tweetData });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
