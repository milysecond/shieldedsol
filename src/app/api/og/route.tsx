import { ImageResponse } from 'next/og';
import { SITE_URL } from '@/lib/constants';

export async function GET() {
  let tvl = '--';
  let change = '';
  let changeColor = '#22c55e';

  // Fetch from our own protocols API
  try {
    const apiRes = await fetch(`${SITE_URL}/api/protocols`);
    const data = await apiRes.json();
    const tvlVal = data?.totalTvl || 0;
    if (tvlVal >= 1e6) {
      tvl = '$' + (tvlVal / 1e6).toFixed(2) + 'M';
    } else if (tvlVal >= 1e3) {
      tvl = '$' + (tvlVal / 1e3).toFixed(2) + 'K';
    } else if (tvlVal > 0) {
      tvl = '$' + tvlVal.toFixed(2);
    }
  } catch (err) {
    console.error('Failed to fetch from protocols API:', err);
  }

  // Get 24h change from DeFiLlama
  try {
    const llamaRes = await fetch('https://api.llama.fi/protocol/privacy-cash');
    const llamaData = await llamaRes.json();
    const chainTvls = llamaData?.chainTvls || {};
    const allHistory = Object.values(chainTvls).flatMap(
      (c: unknown) => (c as { tvl?: { date: number; totalLiquidityUSD: number }[] })?.tvl || []
    );
    if (allHistory.length >= 2) {
      allHistory.sort((a, b) => a.date - b.date);
      const current =
        allHistory[allHistory.length - 1]?.totalLiquidityUSD || 0;
      const yesterday =
        allHistory[allHistory.length - 2]?.totalLiquidityUSD || 0;
      if (yesterday > 0) {
        const pct = ((current - yesterday) / yesterday) * 100;
        const isPositive = pct >= 0;
        change = `${isPositive ? '+' : ''}${pct.toFixed(1)}% 24h`;
        changeColor = isPositive ? '#22c55e' : '#ef4444';
      }
    }
  } catch (err) {
    console.error('Failed to fetch 24h change:', err);
  }

  // Fetch font
  const fontData = await fetch(
    'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.8/files/jetbrains-mono-latin-400-normal.woff'
  ).then((r) => r.arrayBuffer());

  const fontBoldData = await fetch(
    'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.8/files/jetbrains-mono-latin-700-normal.woff'
  ).then((r) => r.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, #0a0a14 0%, #1a1a2e 50%, #0f0f1a 100%)',
          fontFamily: 'JetBrains Mono',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 80px',
            borderRadius: '24px',
            background: 'rgba(153, 69, 255, 0.08)',
            border: '1px solid rgba(153, 69, 255, 0.3)',
            boxShadow: '0 8px 32px rgba(153, 69, 255, 0.15)',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 42,
              fontWeight: 700,
              color: '#9945FF',
              marginBottom: 4,
            }}
          >
            Shielded Sol
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: '#888888',
              marginBottom: 32,
            }}
          >
            Solana Privacy Pools
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#666666',
              marginBottom: 8,
              letterSpacing: 3,
            }}
          >
            TOTAL VALUE LOCKED
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 64,
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: 4,
            }}
          >
            {tvl}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: changeColor,
              marginBottom: 24,
            }}
          >
            {change}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 16,
              color: '#555555',
              marginBottom: 12,
            }}
          >
            shieldedsol.com
          </div>
          <div style={{ display: 'flex', fontSize: 12, color: '#444444' }}>
            Updated: {new Date().toUTCString()}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'JetBrains Mono',
          data: fontData,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'JetBrains Mono',
          data: fontBoldData,
          weight: 700,
          style: 'normal',
        },
      ],
      headers: {
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
}
