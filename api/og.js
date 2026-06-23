import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { logoBase64 } from './logo.js';

// Fetch JetBrains Mono font
async function getFont() {
  const res = await fetch('https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.8/files/jetbrains-mono-latin-400-normal.woff');
  return await res.arrayBuffer();
}

async function getFontBold() {
  const res = await fetch('https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.8/files/jetbrains-mono-latin-700-normal.woff');
  return await res.arrayBuffer();
}

export default async function handler(req, res) {
  let tvl = '--';
  let change = '';
  let changeColor = '#22c55e';
  let protocolCount = 0;

  // Fetch from our own protocols API
  try {
    const apiRes = await fetch('https://www.shieldedsol.com/api/protocols');
    const data = await apiRes.json();

    const tvlVal = data?.totalTvl || 0;
    if (tvlVal >= 1e6) {
      tvl = '$' + (tvlVal / 1e6).toFixed(2) + 'M';
    } else if (tvlVal >= 1e3) {
      tvl = '$' + (tvlVal / 1e3).toFixed(2) + 'K';
    } else if (tvlVal > 0) {
      tvl = '$' + tvlVal.toFixed(2);
    }

    // Count live protocols with TVL
    protocolCount = data?.protocols?.filter(p => p.status === 'live' && p.tvl > 0).length || 0;
  } catch (err) {
    console.error('Failed to fetch from protocols API:', err);
  }

  // Get 24h change from DeFiLlama (for Privacy Cash historical data)
  try {
    const llamaRes = await fetch('https://api.llama.fi/protocol/privacy-cash');
    const llamaData = await llamaRes.json();
    const chainTvls = llamaData?.chainTvls || {};
    const allHistory = Object.values(chainTvls).flatMap(c => c?.tvl || []);
    if (allHistory.length >= 2) {
      allHistory.sort((a, b) => a.date - b.date);
      const current = allHistory[allHistory.length - 1]?.totalLiquidityUSD || 0;
      const yesterday = allHistory[allHistory.length - 2]?.totalLiquidityUSD || 0;
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

  // Glass card element with gradient background
  const element = {
    type: 'div',
    props: {
      style: {
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0a14 0%, #1a1a2e 50%, #0f0f1a 100%)',
        fontFamily: 'JetBrains Mono',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 80px',
              borderRadius: '24px',
              background: 'rgba(153, 69, 255, 0.08)',
              border: '1px solid rgba(153, 69, 255, 0.3)',
              boxShadow: '0 8px 32px rgba(153, 69, 255, 0.15)',
            },
            children: [
              { type: 'img', props: { src: logoBase64, width: 80, height: 80, style: { marginBottom: 16 } } },
              { type: 'div', props: { style: { display: 'flex', fontSize: 42, fontWeight: 700, color: '#9945FF', marginBottom: 4 }, children: 'Shielded Sol' } },
              { type: 'div', props: { style: { display: 'flex', fontSize: 20, color: '#888888', marginBottom: 32 }, children: 'Solana Privacy Pools' } },
              { type: 'div', props: { style: { display: 'flex', fontSize: 14, color: '#666666', marginBottom: 8, letterSpacing: 3 }, children: 'TOTAL VALUE LOCKED' } },
              { type: 'div', props: { style: { display: 'flex', fontSize: 64, fontWeight: 700, color: '#ffffff', marginBottom: 4 }, children: tvl } },
              { type: 'div', props: { style: { display: 'flex', fontSize: 22, color: changeColor, marginBottom: 24 }, children: change } },
              { type: 'div', props: { style: { display: 'flex', fontSize: 16, color: '#555555', marginBottom: 12 }, children: 'shieldedsol.com' } },
              { type: 'div', props: { style: { display: 'flex', fontSize: 12, color: '#444444' }, children: `Updated: ${new Date().toUTCString()}` } },
            ],
          },
        },
      ],
    },
  };

  try {
    const [fontData, fontBoldData] = await Promise.all([getFont(), getFontBold()]);

    const svg = await satori(element, {
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
    });

    const resvg = new Resvg(svg);
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).send(pngBuffer);
  } catch (err) {
    console.error('Failed to generate image:', err);
    res.status(500).json({ error: 'Failed to generate image', details: err.message });
  }
}
