import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { SITE_URL } from '@/lib/constants';
import { fetchProtocolsData } from '@/lib/protocols';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Proto = {
  name: string;
  tvl: number;
  kind?: string;
  status?: string;
};

function fmtUsd(n: number): string {
  if (!n || n <= 0) return '--';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
  return (
    '$' +
    n.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })
  );
}

function fmtSol(n: number): string {
  if (!n || n <= 0) return '--';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toLocaleString('en-US', {
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
}

function fmtUsdFull(n: number): string {
  if (!n || n <= 0) return '--';
  return (
    '$' +
    n.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })
  );
}

async function loadFont(weight: 400 | 700) {
  const url =
    weight === 700
      ? 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.8/files/jetbrains-mono-latin-700-normal.woff'
      : 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.8/files/jetbrains-mono-latin-400-normal.woff';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${weight} failed`);
  return res.arrayBuffer();
}

export async function GET() {
  let totalTvl = 0;
  let solPrice = 0;
  let protocols: Proto[] = [];
  let change = '';
  let changeColor = '#4ade80';

  // Direct in-process fetch — works on Vercel + Workers (no self-HTTP / host mismatch)
  try {
    const data = await fetchProtocolsData();
    totalTvl = Number(data?.totalTvl) || 0;
    solPrice = Number(data?.solPrice) || 0;
    protocols = Array.isArray(data?.protocols) ? data.protocols : [];
  } catch (err) {
    console.error('OG protocols fetch failed:', err);
    // Fallback to public www API
    try {
      const apiRes = await fetch(`${SITE_URL}/api/protocols`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      });
      if (apiRes.ok) {
        const data = await apiRes.json();
        totalTvl = Number(data?.totalTvl) || 0;
        solPrice = Number(data?.solPrice) || 0;
        protocols = Array.isArray(data?.protocols) ? data.protocols : [];
      }
    } catch (e2) {
      console.error('OG SITE_URL fallback failed:', e2);
    }
  }

  // Optional 24h delta from our own total — not Privacy Cash–only Llama
  try {
    const histRes = await fetch(
      `${SITE_URL}/api/v1/history/tvl?range=24h`,
      { cache: 'no-store', signal: AbortSignal.timeout(6000) }
    );
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
            const isPositive = pct >= 0;
            change = `${isPositive ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% 24h`;
            changeColor = isPositive ? '#4ade80' : '#f87171';
          }
        }
      }
    }
  } catch {
    /* optional */
  }

  // Live privacy pools only (no infra / sunset / upcoming zeros)
  const livePools = protocols
    .filter(
      (p) =>
        p.kind !== 'infra' &&
        p.status === 'live' &&
        typeof p.tvl === 'number' &&
        p.tvl > 0
    )
    .sort((a, b) => b.tvl - a.tvl);
  // Prefer API totalTvl when present; else sum live pools
  const liveTotal =
    totalTvl > 0
      ? totalTvl
      : livePools.reduce((s, p) => s + p.tvl, 0);
  const poolProtos = livePools.slice(0, 3);
  const denom = liveTotal > 0 ? liveTotal : 1;
  const solTvl = solPrice > 0 ? liveTotal / solPrice : 0;
  const topShare = poolProtos[0] ? (poolProtos[0].tvl / denom) * 100 : 0;

  let logoSrc = `${SITE_URL}/logo.png`;
  try {
    const logoBuf = await readFile(join(process.cwd(), 'public/logo.png'));
    logoSrc = `data:image/png;base64,${logoBuf.toString('base64')}`;
  } catch {
    /* Workers/path edge — use absolute URL */
  }

  const [fontData, fontBoldData] = await Promise.all([
    loadFont(400),
    loadFont(700),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          position: 'relative',
          background: '#07060c',
          fontFamily: 'JetBrains Mono',
          color: '#ededed',
          overflow: 'hidden',
        }}
      >
        {/* ambient glows */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            left: -60,
            width: 420,
            height: 420,
            borderRadius: 999,
            background:
              'radial-gradient(circle, rgba(153,69,255,0.42) 0%, rgba(153,69,255,0.08) 45%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -140,
            right: -30,
            width: 400,
            height: 400,
            borderRadius: 999,
            background:
              'radial-gradient(circle, rgba(56,189,248,0.14) 0%, transparent 65%)',
            display: 'flex',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '40px 48px 36px',
            boxSizing: 'border-box',
          }}
        >
          {/* top bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* boxless logo + soft glow */}
              <div
                style={{
                  display: 'flex',
                  width: 88,
                  height: 88,
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    width: 110,
                    height: 110,
                    borderRadius: 999,
                    background:
                      'radial-gradient(circle, rgba(153,69,255,0.55) 0%, transparent 70%)',
                    display: 'flex',
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoSrc}
                  width={78}
                  height={78}
                  alt=""
                  style={{ position: 'relative' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 40,
                    fontWeight: 700,
                    letterSpacing: -1,
                    color: '#f5f3ff',
                    lineHeight: 1.1,
                  }}
                >
                  Shielded Sol
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 18,
                    color: '#a78bfa',
                    marginTop: 6,
                  }}
                >
                  Solana privacy pool TVL
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                borderRadius: 999,
                border: '1px solid rgba(34,197,94,0.35)',
                background: 'rgba(34,197,94,0.08)',
                color: '#86efac',
                fontSize: 17,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: '#22c55e',
                  boxShadow: '0 0 12px rgba(34,197,94,0.9)',
                  display: 'flex',
                }}
              />
              live
            </div>
          </div>

          {/* hero numbers */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginBottom: 18,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 14,
                letterSpacing: 3,
                color: '#7c7394',
                marginBottom: 8,
              }}
            >
              TOTAL VALUE LOCKED
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 16,
                flexWrap: 'nowrap',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 12,
                  fontSize: 72,
                  fontWeight: 700,
                  letterSpacing: -2,
                  color: '#ffffff',
                  lineHeight: 1,
                }}
              >
                {fmtSol(solTvl)}
                <span
                  style={{
                    fontSize: 28,
                    color: '#9945FF',
                    letterSpacing: 1,
                    fontWeight: 700,
                  }}
                >
                  SOL
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 32,
                  color: '#c4b5fd',
                  fontWeight: 700,
                }}
              >
                {fmtUsdFull(liveTotal)}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 12,
                alignItems: 'center',
                color: '#8b8498',
                fontSize: 18,
              }}
            >
              {change ? (
                <span style={{ color: changeColor, display: 'flex' }}>
                  {change}
                </span>
              ) : null}
              {poolProtos[0] ? (
                <span style={{ display: 'flex' }}>
                  {topShare.toFixed(1)}% {poolProtos[0].name}
                </span>
              ) : null}
              {solPrice > 0 ? (
                <span style={{ display: 'flex' }}>
                  1 SOL = ${solPrice.toFixed(2)}
                </span>
              ) : null}
            </div>
          </div>

          {/* composition bar */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: 12,
              borderRadius: 999,
              overflow: 'hidden',
              background: '#16131f',
              marginBottom: 16,
              border: '1px solid rgba(153,69,255,0.15)',
              flexShrink: 0,
            }}
          >
            {poolProtos.map((p, i) => {
              const w = Math.max(3, (p.tvl / denom) * 100);
              const alpha = [0.95, 0.7, 0.48][i] || 0.3;
              return (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    width: `${w}%`,
                    height: '100%',
                    background: `rgba(153, 69, 255, ${alpha})`,
                  }}
                />
              );
            })}
          </div>

          {/* protocol rows — fixed height, no overflow into footer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              width: '100%',
              flexShrink: 0,
            }}
          >
            {poolProtos.map((p, i) => {
              const share = (p.tvl / denom) * 100;
              const alpha = [0.95, 0.7, 0.48][i] || 0.3;
              return (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(153,69,255,0.12)',
                    height: 58,
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 999,
                        background: `rgba(153, 69, 255, ${alpha})`,
                        display: 'flex',
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        fontSize: 22,
                        color: '#f5f3ff',
                        fontWeight: 700,
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        fontSize: 16,
                        color: '#8b8498',
                      }}
                    >
                      {share.toFixed(1)}%
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      alignItems: 'baseline',
                      fontSize: 20,
                      color: '#c4b5fd',
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ display: 'flex' }}>
                      {fmtSol(solPrice > 0 ? p.tvl / solPrice : 0)} SOL
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        color: '#7c7394',
                        fontWeight: 400,
                        fontSize: 17,
                      }}
                    >
                      {fmtUsd(p.tvl)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* spacer pushes footer down without overlap */}
          <div style={{ display: 'flex', flex: 1, minHeight: 12 }} />

          {/* footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 14,
              borderTop: '1px solid rgba(153,69,255,0.18)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 20,
                color: '#9945FF',
                fontWeight: 700,
                letterSpacing: 0.4,
              }}
            >
              shieldedsol.com
            </div>
            <div style={{ display: 'flex', fontSize: 15, color: '#6b6478' }}>
              @shieldedsol · real-time Solana privacy TVL
            </div>
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
        'Cache-Control':
          'public, max-age=120, s-maxage=120, stale-while-revalidate=60',
        'CDN-Cache-Control': 'public, max-age=120',
        'Vercel-CDN-Cache-Control': 'public, max-age=120',
      },
    }
  );
}
