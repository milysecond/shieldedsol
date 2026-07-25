'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';

const PrivateTipping = dynamic(() => import('./PrivateTipping'), {
  ssr: false,
  loading: () => null,
});

interface Pool {
  asset: string;
  balance: number;
  usd: number;
  address: string | null;
}
interface Protocol {
  name: string;
  status: string;
  url: string;
  linkText?: string;
  tvl: number;
  pools: Pool[];
  stats?: string;
  kind?: 'pool' | 'infra';
}
interface ProtocolsResponse {
  solPrice: number;
  bonkPrice: number;
  orePrice: number;
  totalTvl: number;
  protocols: Protocol[];
  updatedAt: string;
  cached?: boolean;
}
interface HistoryPoint {
  timestamp: string;
  totalTvl: number;
}
interface ProtocolHistoryPoint {
  timestamp: string;
  tvl: number;
}

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null || isNaN(n)) return '--';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '--';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
  return '$' + fmt(n);
}

export default function Dashboard() {
  const [data, setData] = useState<ProtocolsResponse | null>(null);
  const [chartHistory, setChartHistory] = useState<HistoryPoint[]>([]);
  const [chartPeriod, setChartPeriod] = useState(7);
  const [lightMode, setLightMode] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [openCharts, setOpenCharts] = useState<
    Record<string, ProtocolHistoryPoint[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [subscribeState, setSubscribeState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const lastTvlRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      setLightMode(true);
      document.body.classList.add('light');
    }
    setAlertsEnabled(localStorage.getItem('alerts') === 'true');
    lastTvlRef.current = parseFloat(localStorage.getItem('lastTvl') || '0');
  }, []);

  const toggleTheme = useCallback(() => {
    setLightMode((prev) => {
      const next = !prev;
      document.body.classList.toggle('light', next);
      localStorage.setItem('theme', next ? 'light' : 'dark');
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    // Hard client timeout so UI never spins forever
    const timer = setTimeout(() => ac.abort(), 25000);

    try {
      setError(null);
      const res = await fetch('/api/protocols', {
        signal: ac.signal,
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API ${res.status}: ${body.slice(0, 120)}`);
      }
      const json: ProtocolsResponse = await res.json();
      if (!json?.protocols?.length) throw new Error('Empty protocols payload');
      setData(json);

      const tvl = json.totalTvl;
      if (
        alertsEnabled &&
        lastTvlRef.current > 0 &&
        tvl > 0 &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const change = ((tvl - lastTvlRef.current) / lastTvlRef.current) * 100;
        if (Math.abs(change) >= 10) {
          const arrow = change > 0 ? '\u2191' : '\u2193';
          new Notification('Shielded Sol TVL Alert', {
            body: `TVL ${arrow} ${Math.abs(change).toFixed(1)}% to ${fmtUsd(tvl)}`,
            icon: '/api/icon?size=192',
            tag: 'tvl-alert',
          });
        }
      }
      localStorage.setItem('lastTvl', String(tvl));
      lastTvlRef.current = tvl;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        setError('Request timed out. Tap refresh.');
      } else {
        console.error('Fetch error:', e);
        setError(e instanceof Error ? e.message : 'Failed to load data');
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [alertsEnabled]);

  const fetchChart = useCallback(async (days: number) => {
    try {
      const rangeMap: Record<number, string> = {
        7: '7d',
        30: '30d',
        90: '90d',
      };
      const res = await fetch(
        `/api/history/tvl?range=${rangeMap[days] || '7d'}`,
        { signal: AbortSignal.timeout(12000) }
      );
      if (!res.ok) {
        setChartHistory([]);
        return;
      }
      const json = await res.json();
      setChartHistory(json.history || []);
    } catch (e) {
      console.error('Chart fetch error:', e);
      setChartHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchChart(chartPeriod);
    const interval = setInterval(() => {
      fetchData();
      fetchChart(chartPeriod);
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchData, fetchChart, chartPeriod]);

  const handleSetChartPeriod = useCallback(
    (days: number) => {
      setChartPeriod(days);
      fetchChart(days);
    },
    [fetchChart]
  );

  const toggleAlerts = useCallback(async () => {
    if (!alertsEnabled) {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setAlertsEnabled(true);
          localStorage.setItem('alerts', 'true');
          new Notification('Shielded Sol', {
            body: "TVL alerts enabled! You'll be notified of 10%+ changes.",
            icon: '/api/icon?size=192',
          });
        }
      }
    } else {
      setAlertsEnabled(false);
      localStorage.setItem('alerts', 'false');
    }
  }, [alertsEnabled]);

  const toggleProtocolChart = useCallback(
    async (protocolName: string) => {
      if (openCharts[protocolName]) {
        setOpenCharts((prev) => {
          const next = { ...prev };
          delete next[protocolName];
          return next;
        });
      } else {
        try {
          const res = await fetch(
            `/api/history/protocol?protocol=${encodeURIComponent(protocolName)}&range=7d`,
            { signal: AbortSignal.timeout(10000) }
          );
          const json = await res.json();
          setOpenCharts((prev) => ({
            ...prev,
            [protocolName]: json.history || [],
          }));
        } catch (e) {
          console.error('Protocol chart error:', e);
          setOpenCharts((prev) => ({ ...prev, [protocolName]: [] }));
        }
      }
    },
    [openCharts]
  );

  const getShareText = useCallback(() => {
    const tvl = data ? fmtUsd(data.totalTvl) : '$--';
    const top = (data?.protocols || [])
      .filter((p) => p.kind !== 'infra' && p.tvl > 0)
      .slice(0, 3)
      .map((p) => `${p.name} ${fmtUsd(p.tvl)}`)
      .join(' · ');
    return `Solana Privacy Pools TVL: ${tvl}${top ? `\n${top}` : ''}\n\nTrack live on shieldedsol.com`;
  }, [data]);

  const handleSubscribe = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email || subscribeState === 'loading') return;
      setSubscribeState('loading');
      try {
        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        setSubscribeState(res.ok ? 'success' : 'error');
      } catch {
        setSubscribeState('error');
      }
    },
    [email, subscribeState]
  );

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchData();
    fetchChart(chartPeriod);
  }, [fetchData, fetchChart, chartPeriod]);

  const protocols = data?.protocols || [];

  let tvlChangeText = '';
  let tvlChangeClass = '';
  if (data && chartHistory.length >= 2) {
    const current = data.totalTvl;
    const previous = chartHistory[0]?.totalTvl || 0;
    if (previous > 0) {
      const change = ((current - previous) / previous) * 100;
      const arrow = change >= 0 ? '\u2191' : '\u2193';
      tvlChangeText = `${arrow} ${Math.abs(change).toFixed(2)}% (${chartPeriod}D)`;
      tvlChangeClass = change >= 0 ? 'up' : 'down';
    }
  }

  const chartMax =
    chartHistory.length > 0
      ? Math.max(...chartHistory.map((d) => d.totalTvl))
      : 0;
  const chartStartLabel =
    chartHistory.length > 0
      ? new Date(chartHistory[0].timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : '--';
  const chartEndLabel =
    chartHistory.length > 0
      ? new Date(
          chartHistory[chartHistory.length - 1].timestamp
        ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '--';

  const updatedLabel = useMemo(() => {
    if (!data?.updatedAt) return '--';
    try {
      return new Date(data.updatedAt).toLocaleTimeString();
    } catch {
      return '--';
    }
  }, [data?.updatedAt]);

  return (
    <div className="container">
      <header>
        <div>
          <h1>
            <img src="/logo.svg" alt="Shielded Sol" className="logo" />
            Shielded Sol
          </h1>
          <p className="tagline">
            Solana Privacy Pools &middot;{' '}
            <a
              href="https://x.com/shieldedsol"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--text3)', textDecoration: 'none' }}
            >
              @shieldedsol
            </a>
          </p>
        </div>
        <div className="header-actions">
          <button
            className="action-btn"
            onClick={toggleTheme}
            title="Toggle Theme"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
          <button
            className={`action-btn${alertsEnabled ? ' active' : ''}`}
            onClick={toggleAlerts}
            title="TVL Alerts"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
          <button
            className="action-btn"
            onClick={() => {
              const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText())}`;
              window.open(url, '_blank', 'width=550,height=420');
            }}
            title="Share TVL on X"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </button>
          <button
            className="action-btn"
            onClick={() => {
              const url = `https://t.me/share/url?url=${encodeURIComponent('https://shieldedsol.com')}&text=${encodeURIComponent(getShareText())}`;
              window.open(url, '_blank', 'width=550,height=420');
            }}
            title="Share on Telegram"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          </button>
          <button
            className="action-btn"
            onClick={async () => {
              await navigator.clipboard.writeText(
                getShareText() + '\nhttps://shieldedsol.com'
              );
            }}
            title="Copy TVL Stats"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>
      </header>

      {error && (
        <div
          className="protocol"
          style={{
            border: '1px solid #ef4444',
            borderRadius: 6,
            padding: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ color: '#ef4444', fontSize: '0.75rem', marginBottom: 6 }}>
            {error}
          </div>
          <button className="refresh" onClick={refresh}>
            retry
          </button>
        </div>
      )}

      <div className="total">
        <div className="total-label">
          Total Value Locked &middot;{' '}
          <span>
            {data
              ? `SOL $${data.solPrice.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : 'SOL $--'}
          </span>
        </div>
        <div
          className={`total-value${loading && !data ? ' loading-tvl' : ' revealed'}`}
        >
          {data ? fmtUsd(data.totalTvl) : loading ? '' : '$--'}
        </div>
        {tvlChangeText && (
          <div className={`tvl-change ${tvlChangeClass}`}>{tvlChangeText}</div>
        )}
      </div>

      <div className="chart">
        <div className="chart-header">
          <div className="chart-title">TVL History</div>
          <div className="chart-tabs">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className={`chart-tab${chartPeriod === d ? ' active' : ''}`}
                onClick={() => handleSetChartPeriod(d)}
              >
                {d}D
              </button>
            ))}
          </div>
        </div>
        <div className="chart-container">
          {chartHistory.length > 0
            ? chartHistory.map((point, i) => {
                const h = chartMax > 0 ? (point.totalTvl / chartMax) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="chart-bar revealed"
                    style={{ height: `${h}%`, animationDelay: `${i * 0.03}s` }}
                    title={fmtUsd(point.totalTvl)}
                  />
                );
              })
            : loading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="chart-bar loading-bar"
                    style={{
                      height: `${30 + ((i * 17) % 40)}%`,
                      animationDelay: `${i * 0.05}s`,
                    }}
                  />
                ))
              : (
                <div
                  style={{
                    color: 'var(--text5)',
                    fontSize: '0.65rem',
                    padding: '1rem 0',
                    width: '100%',
                    textAlign: 'center',
                  }}
                >
                  No history yet — live TVL still updates above
                </div>
              )}
        </div>
        <div className="chart-labels">
          <span className="chart-label">{chartStartLabel}</span>
          <span className="chart-label">{chartEndLabel}</span>
        </div>
      </div>

      <div>
        {(loading && !data
          ? [
              'Privacy Cash',
              'Umbra',
              'Vanish Trade',
              'Arcium',
              'Turbine',
              'Mixoor',
              'Elusiv',
            ]
          : protocols
        ).map((p) => {
          const isPlaceholder = typeof p === 'string';
          const name = isPlaceholder ? p : p.name;
          const protocol = isPlaceholder ? null : p;
          const status = protocol?.status || 'live';
          const isInfra = protocol?.kind === 'infra';
          const statusClass = isInfra
            ? 'status-infra'
            : 'status-' + status;
          const statusText = isInfra
            ? 'INFRA'
            : status === 'live'
              ? 'LIVE'
              : status === 'upcoming'
                ? 'SOON'
                : 'SUNSET';
          const tvl = protocol?.tvl;
          const stats = protocol?.stats;
          const isChartOpen = name in openCharts;
          const chartData = openCharts[name] || [];
          const protoChartMax =
            chartData.length > 0
              ? Math.max(...chartData.map((d) => d.tvl))
              : 0;
          const pools = protocol?.pools || [];
          const share =
            data && protocol && data.totalTvl > 0 && protocol.kind !== 'infra'
              ? (protocol.tvl / data.totalTvl) * 100
              : null;

          return (
            <div key={name} className="protocol">
              <div className="protocol-header">
                <span className="protocol-name">
                  {name}
                  {!isPlaceholder && protocol?.kind === 'infra' ? (
                    <span
                      className="protocol-tvl revealed"
                      style={{ color: 'var(--text3)', marginLeft: 8 }}
                    >
                      · network
                    </span>
                  ) : tvl != null ? (
                    <span className="protocol-tvl revealed" style={{ marginLeft: 8 }}>
                      {fmtUsd(tvl)}
                    </span>
                  ) : loading ? (
                    <span className="loading" style={{ marginLeft: 8 }} />
                  ) : null}
                  {share != null && share >= 0.05 && (
                    <span
                      style={{
                        marginLeft: 8,
                        color: 'var(--text4)',
                        fontSize: '0.65rem',
                        fontWeight: 400,
                      }}
                    >
                      {share.toFixed(1)}%
                    </span>
                  )}
                </span>
                <span className={`protocol-status ${statusClass}`}>
                  {statusText}
                </span>
              </div>
              {stats && (
                <div
                  className="revealed"
                  style={{
                    color: 'var(--text3)',
                    fontSize: '0.65rem',
                    margin: '0.15rem 0 0.35rem',
                    lineHeight: 1.35,
                  }}
                >
                  {stats}
                </div>
              )}
              {pools.length > 0 && (
                <div className="pools">
                  {pools.map((pool) => (
                    <div key={pool.asset} className="pool">
                      <span className="pool-asset">{pool.asset}</span>
                      <div className="pool-balance">
                        <div className="pool-usd">
                          <span
                            className="revealed"
                            style={{ animationDelay: '0.15s' }}
                          >
                            {fmtUsd(pool.usd)}
                          </span>
                        </div>
                        <div className="pool-amount">
                          <span className="revealed">
                            {fmt(pool.balance, 2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!isPlaceholder && (
                <>
                  <button
                    className={`protocol-chart-toggle${isChartOpen ? ' open' : ''}`}
                    onClick={() => toggleProtocolChart(name)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    {isChartOpen ? 'Hide history' : 'View history'}
                  </button>
                  {isChartOpen && (
                    <div className="protocol-chart open">
                      <div className="protocol-chart-container">
                        {chartData.length > 0 ? (
                          chartData.map((d, i) => {
                            const h =
                              protoChartMax > 0
                                ? (d.tvl / protoChartMax) * 100
                                : 0;
                            return (
                              <div
                                key={i}
                                className="protocol-chart-bar revealed"
                                style={{
                                  height: `${h}%`,
                                  animationDelay: `${i * 0.02}s`,
                                }}
                                title={fmtUsd(d.tvl)}
                              />
                            );
                          })
                        ) : (
                          <div
                            style={{
                              color: 'var(--text5)',
                              fontSize: '0.625rem',
                              padding: '0.5rem 0',
                            }}
                          >
                            No historical data yet
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <a
                    href={protocol!.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="protocol-link"
                  >
                    {protocol!.linkText ||
                      protocol!.url.replace(/^https?:\/\//, '')}
                  </a>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="protocol" style={{ marginTop: '1rem' }}>
        <div className="protocol-header">
          <span className="protocol-name">Stay updated</span>
        </div>
        {subscribeState === 'success' ? (
          <p
            style={{
              color: 'var(--accent)',
              fontSize: '0.75rem',
              margin: '0.5rem 0',
            }}
          >
            Subscribed! We&apos;ll notify you of major TVL changes.
          </p>
        ) : (
          <form
            onSubmit={handleSubscribe}
            style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                flex: 1,
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '0.4rem 0.6rem',
                color: 'var(--text1, var(--text))',
                fontSize: '16px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={subscribeState === 'loading'}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '0.4rem 0.75rem',
                fontSize: '0.75rem',
                cursor: subscribeState === 'loading' ? 'wait' : 'pointer',
                opacity: subscribeState === 'loading' ? 0.7 : 1,
              }}
            >
              {subscribeState === 'loading' ? '...' : 'Subscribe'}
            </button>
          </form>
        )}
        {subscribeState === 'error' && (
          <p
            style={{
              color: '#ef4444',
              fontSize: '0.7rem',
              margin: '0.25rem 0 0',
            }}
          >
            Something went wrong. Try again.
          </p>
        )}
      </div>

      <PrivateTipping />

      <footer>
        <button className="refresh" onClick={refresh}>
          refresh
        </button>
        <span>
          {' '}
          &middot; {updatedLabel}
          {data?.cached ? ' · cached' : ''}
        </span>
        <span style={{ float: 'right' }}>
          <a href="/history">history</a> &middot;{' '}
          <a
            href="https://x.com/shieldedsol"
            target="_blank"
            rel="noopener noreferrer"
          >
            @shieldedsol
          </a>{' '}
          &middot;{' '}
          <a
            href="https://t.me/metasal"
            target="_blank"
            rel="noopener noreferrer"
          >
            + add protocol
          </a>{' '}
          &middot;{' '}
          <a
            href="https://metasal.xyz"
            target="_blank"
            rel="noopener noreferrer"
          >
            metasal.xyz
          </a>
        </span>
      </footer>
    </div>
  );
}
