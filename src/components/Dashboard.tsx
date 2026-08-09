'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import DonationWallet from './DonationWallet';
import LoadOrb from './LoadOrb';
import { PROTOCOL_X_HANDLES } from '@/lib/constants';

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

function fmtUsdFull(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '--';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function usdToSol(usd: number | null | undefined, solPrice: number): number | null {
  if (usd == null || isNaN(usd) || !solPrice || solPrice <= 0) return null;
  return usd / solPrice;
}

function fmtSol(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '--';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  if (n >= 100) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSolFull(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '--';
  if (n >= 1000) {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Native token amount for pool chips (not unit-toggle value) */
function fmtPoolNative(balance: number, asset: string): string {
  if (balance == null || isNaN(balance)) return '--';
  const stable = ['USDC', 'USDT', 'USD1', 'CASH', 'USD'];
  if (stable.includes(asset.toUpperCase())) {
    return balance.toLocaleString('en-US', {
      minimumFractionDigits: balance < 100 ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }
  if (asset.toUpperCase() === 'BONK') {
    if (balance >= 1e9) return (balance / 1e9).toFixed(2) + 'B';
    if (balance >= 1e6) return (balance / 1e6).toFixed(2) + 'M';
    if (balance >= 1e3) return (balance / 1e3).toFixed(1) + 'K';
    return balance.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return fmtSol(balance);
}

type DisplayUnit = 'sol' | 'usd';

const DOT_ALPHAS = [0.95, 0.78, 0.62, 0.5, 0.4, 0.32, 0.26, 0.2, 0.16, 0.12];
function segmentColor(i: number, _accent = false): string {
  const a = DOT_ALPHAS[Math.min(i, DOT_ALPHAS.length - 1)];
  // Purple segments read on both dark and light
  return `rgba(124, 44, 255, ${a})`;
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [unit, setUnit] = useState<DisplayUnit>('sol');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [subscribeState, setSubscribeState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const lastTvlRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const dataRef = useRef<ProtocolsResponse | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      setLightMode(true);
      document.body.classList.add('light');
      document.body.dataset.theme = 'light';
    } else {
      document.body.dataset.theme = 'dark';
    }
    setAlertsEnabled(localStorage.getItem('tvl-alerts') === 'true');
    const savedUnit =
      localStorage.getItem('display-unit') ||
      localStorage.getItem('displayUnit');
    if (savedUnit === 'usd' || savedUnit === 'sol') setUnit(savedUnit);
  }, []);

  const setDisplayUnit = useCallback((next: DisplayUnit) => {
    setUnit(next);
    localStorage.setItem('display-unit', next);
    localStorage.setItem('displayUnit', next);
  }, []);

  const toggleTheme = useCallback(() => {
    setLightMode((prev) => {
      const next = !prev;
      document.body.classList.toggle('light', next);
      document.body.dataset.theme = next ? 'light' : 'dark';
      localStorage.setItem('theme', next ? 'light' : 'dark');
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let timedOut = false;
    // Client cap — server should answer faster; ignore non-timeout aborts
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, 18000);

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
      // Prefer keeping previous good data over empty timeout shells
      if (!json?.protocols?.length) {
        if (abortRef.current !== ac) return;
        if (!dataRef.current) throw new Error('Empty protocols payload');
        return;
      }
      // Ignore if a newer request already started
      if (abortRef.current !== ac) return;
      dataRef.current = json;
      setData(json);
      setError(null);

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
      if (abortRef.current !== ac) return; // superseded
      if ((e as Error)?.name === 'AbortError') {
        if (timedOut) setError('Request timed out. Tap refresh.');
        // cleanup/unmount abort → silent
      } else {
        console.error('Fetch error:', e);
        setError(e instanceof Error ? e.message : 'Failed to load data');
      }
    } finally {
      clearTimeout(timer);
      if (abortRef.current === ac) setLoading(false);
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

  const toggleExpanded = useCallback((protocolName: string) => {
    setExpanded((prev) => ({ ...prev, [protocolName]: !prev[protocolName] }));
  }, []);

  const getShareText = useCallback(() => {
      const solPrice = data?.solPrice || 0;
      const fmtVal = (usd: number) =>
        unit === 'sol'
          ? `${fmtSol(usdToSol(usd, solPrice))} SOL`
          : fmtUsd(usd);
      const tvl = data ? fmtVal(data.totalTvl) : '--';
      const live = (data?.protocols || []).filter(
        (p) => p.kind !== 'infra' && p.status === 'live' && p.tvl > 0
      );
      const top = live
        .slice(0, 4)
        .map((p) => `${p.name} ${fmtVal(p.tvl)}`)
        .join(' · ');
      const tags = Array.from(
        new Set(
          live
            .slice(0, 5)
            .map((p) => PROTOCOL_X_HANDLES[p.name])
            .filter(Boolean)
            .map((h) => `@${h}`)
        )
      );
      // Always credit site; no hashtags
      if (!tags.includes('@shieldedsol')) tags.push('@shieldedsol');
      return `Solana privacy pool TVL: ${tvl}${top ? `\n${top}` : ''}${
        tags.length ? `\n\n${tags.join(' ')}` : ''
      }\n\nTrack live → https://www.shieldedsol.com`;
    }, [data, unit]);

  const shareUrl = 'https://www.shieldedsol.com';

  const openShare = useCallback(
    async (kind: 'x' | 'telegram' | 'copy') => {
      const text = getShareText();
      if (kind === 'x') {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
          '_blank',
          'width=550,height=420'
        );
        return;
      }
      if (kind === 'telegram') {
        window.open(
          `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`,
          '_blank',
          'width=550,height=420'
        );
        return;
      }
      try {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        setCopied(false);
      }
    },
    [getShareText]
  );

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

  // Pool TVL only for composition bar (exclude infra like Arcium)
  const poolProtocols = useMemo(
    () =>
      protocols.filter(
        (p) => p.kind !== 'infra' && p.status === 'live' && p.tvl > 0
      ),
    [protocols]
  );
  const poolTvlSum = useMemo(
    () => poolProtocols.reduce((s, p) => s + (p.tvl || 0), 0),
    [poolProtocols]
  );
  const topShare =
    poolTvlSum > 0 && poolProtocols[0]
      ? (poolProtocols[0].tvl / poolTvlSum) * 100
      : 0;

  const solPrice = data?.solPrice || 0;
  const fmtValue = useCallback(
    (usd: number | null | undefined) => {
      if (unit === 'usd') return fmtUsd(usd);
      return fmtSol(usdToSol(usd, solPrice));
    },
    [unit, solPrice]
  );
  const fmtValueFull = useCallback(
    (usd: number | null | undefined) => {
      if (unit === 'usd') return fmtUsdFull(usd);
      return fmtSolFull(usdToSol(usd, solPrice));
    },
    [unit, solPrice]
  );
  const heroTotalSol = data ? usdToSol(data.totalTvl, solPrice) : null;

  const placeholders = [
    'Privacy Cash',
    'Umbra',
    'Arcium',
    'MagicBlock',
    'Helius Rings',
    'Vanish Trade',
    'Turbine',
    'Mixoor',
    'Light Protocol',
    'Elusiv',
  ];

  return (
    <div className="app-shell">
      {copied && <div className="copy-toast">Copied to clipboard</div>}
      <header className="topbar">
        <button
          type="button"
          className="topbar-brand"
          title="Copy site URL"
          onClick={() =>
            navigator.clipboard.writeText('https://shieldedsol.com')
          }
        >
          shielded.sol
        </button>
        <div className="topbar-right">
          <div className="header-actions" aria-label="Actions">
            <button
              className="action-btn"
              onClick={toggleTheme}
              title="Toggle Theme"
              type="button"
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
              type="button"
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
              onClick={() => openShare('x')}
              title="Share TVL on X"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </button>
            <button
              className="action-btn"
              onClick={() => openShare('telegram')}
              title="Share on Telegram"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </button>
            <button
              className={`action-btn${copied ? ' active' : ''}`}
              onClick={() => openShare('copy')}
              title={copied ? 'Copied!' : 'Copy TVL stats'}
              type="button"
              aria-label={copied ? 'Copied' : 'Copy TVL stats'}
            >
              {copied ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
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
              )}
            </button>
          </div>
          <span className={`live-pill${loading ? ' is-loading' : ''}`}>
            {loading ? (
              <LoadOrb
                state="breathing"
                size={20}
                theme={lightMode ? 'light' : 'dark'}
                label="Updating"
              />
            ) : (
              <span className="live-dot" />
            )}
            {loading ? 'sync' : 'live'}
          </span>
        </div>
      </header>

      <main className="hero-main">
        <div className="hero">
          <div className="hero-logo">
            <div className="hero-glow" aria-hidden="true" />
            <img
              src="/logo.svg"
              alt="Shielded Sol"
              className="logo hero-logo-img"
              width={88}
              height={88}
            />
          </div>
          <h1 className="hero-title">Shielded Sol</h1>
          <div
            className={`hero-tvl${loading && !data ? ' loading-tvl' : ' revealed'}`}
          >
            {data ? (
              <>
                {unit === 'usd' ? (
                  <span className="hero-currency">$</span>
                ) : null}
                {fmtValueFull(data.totalTvl)}
                {unit === 'sol' ? (
                  <span className="hero-unit">SOL</span>
                ) : null}
              </>
            ) : loading ? (
              <LoadOrb
                state="searching"
                size={64}
                theme={lightMode ? 'light' : 'dark'}
                label="Loading TVL"
                className="hero-load-orb"
              />
            ) : (
              '--'
            )}
          </div>

          <div
            className="unit-toggle"
            role="group"
            aria-label="Display unit"
          >
            <button
              type="button"
              className={`unit-btn${unit === 'sol' ? ' active' : ''}`}
              onClick={() => setDisplayUnit('sol')}
              aria-pressed={unit === 'sol'}
            >
              SOL
            </button>
            <button
              type="button"
              className={`unit-btn${unit === 'usd' ? ' active' : ''}`}
              onClick={() => setDisplayUnit('usd')}
              aria-pressed={unit === 'usd'}
            >
              USD
            </button>
            <span
              className={`unit-thumb${unit === 'usd' ? ' right' : ''}`}
              aria-hidden
            />
          </div>

          <div className="comp-bar-wrap">
            <div className="comp-bar" role="img" aria-label="TVL composition">
              {loading && !data
                ? [55, 25, 12, 5, 3].map((w, i) => (
                    <div
                      key={i}
                      className="comp-seg"
                      style={{
                        width: `${w}%`,
                        backgroundColor: segmentColor(i, true),
                        opacity: 0.35,
                      }}
                    />
                  ))
                : poolProtocols.map((p, i) => {
                    const w =
                      poolTvlSum > 0 ? (p.tvl / poolTvlSum) * 100 : 0;
                    if (w < 0.05) return null;
                    return (
                      <div
                        key={p.name}
                        className="comp-seg"
                        title={`${p.name} ${w.toFixed(1)}%`}
                        style={{
                          width: `${w}%`,
                          backgroundColor: segmentColor(i, true),
                        }}
                      />
                    );
                  })}
            </div>
            <p className="comp-meta">
              {data ? (
                <>
                  {topShare.toFixed(1)}% {poolProtocols[0]?.name || ''}
                  {data.solPrice
                    ? unit === 'sol'
                      ? ` · 1 SOL = $${data.solPrice.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : ` · ${fmtSol(heroTotalSol)} SOL`
                    : ''}
                  {tvlChangeText ? (
                    <span className={`tvl-change ${tvlChangeClass}`}>
                      {' '}
                      · {tvlChangeText}
                    </span>
                  ) : null}
                </>
              ) : (
                'loading composition…'
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <div>{error}</div>
            <button className="refresh" onClick={refresh}>
              retry
            </button>
          </div>
        )}

        <div className="proto-table">
          <div className="proto-head">
            <span />
            <span>Protocol</span>
            <span className="num">Status</span>
            <span className="num">{unit === 'sol' ? 'SOL' : 'USD'}</span>
          </div>
          {(loading && !data ? placeholders : protocols).map((p, idx) => {
            const isPlaceholder = typeof p === 'string';
            const name = isPlaceholder ? p : p.name;
            const protocol = isPlaceholder ? null : p;
            const isInfra = protocol?.kind === 'infra';
            const status = protocol?.status || 'live';
            const statusText = isInfra
              ? 'INFRA'
              : status === 'live'
                ? 'LIVE'
                : status === 'upcoming'
                  ? 'SOON'
                  : 'SUNSET';
            const tvl = protocol?.tvl;
            const share =
              data &&
              protocol &&
              poolTvlSum > 0 &&
              !isInfra &&
              protocol.tvl > 0
                ? (protocol.tvl / poolTvlSum) * 100
                : null;
            const isChartOpen = name in openCharts;
            const chartData = openCharts[name] || [];
            const isOpen = !!expanded[name];
            const protoChartMax =
              chartData.length > 0
                ? Math.max(...chartData.map((d) => d.tvl))
                : 0;
            const pools = protocol?.pools || [];
            const stats = protocol?.stats;
            const dotI = isInfra
              ? 4
              : Math.max(
                  0,
                  poolProtocols.findIndex((x) => x.name === name)
                );
            const hasDetails =
              !isPlaceholder &&
              (!!stats || pools.length > 0 || !!protocol);

            return (
              <div
                key={name}
                className={`proto-block${isOpen ? ' open' : ''}`}
              >
                <button
                  type="button"
                  className={`proto-row${isPlaceholder ? ' muted' : ''}`}
                  onClick={() => {
                    if (!isPlaceholder) toggleExpanded(name);
                  }}
                  aria-expanded={isOpen}
                  disabled={isPlaceholder}
                >
                  <span
                    className="proto-dot"
                    style={{
                      backgroundColor: segmentColor(
                        dotI < 0 ? idx : dotI,
                        true
                      ),
                    }}
                  />
                  <span className="proto-name">
                    {name}
                    {share != null && share >= 0.5 && (
                      <span className="proto-share">{share.toFixed(1)}%</span>
                    )}
                  </span>
                  <span
                    className={`proto-status num status-${isInfra ? 'infra' : status}`}
                  >
                    {loading && !protocol ? '···' : statusText}
                  </span>
                  <span className="proto-usd num">
                    {isInfra
                      ? '—'
                      : tvl != null
                        ? fmtValue(tvl)
                        : loading
                          ? '···'
                          : '—'}
                    {hasDetails && (
                      <span
                        className={`proto-chevron${isOpen ? ' open' : ''}`}
                        aria-hidden
                      >
                        ▾
                      </span>
                    )}
                  </span>
                </button>
                {isOpen && !isPlaceholder && protocol && (
                  <div className="proto-details">
                    {stats && <div className="proto-stats">{stats}</div>}
                    {pools.length > 0 && (
                      <div className="proto-pools">
                        {pools.map((pool) => (
                          <div key={pool.asset} className="proto-pool-chip">
                            <span className="pool-native">
                              {fmtPoolNative(pool.balance, pool.asset)}{' '}
                              {pool.asset}
                            </span>
                            <span className="pool-equiv num">
                              ≈{' '}
                              {unit === 'sol'
                                ? `${fmtSol(usdToSol(pool.usd, solPrice))} SOL`
                                : fmtUsd(pool.usd)}
                            </span>
                            {pool.address ? (
                              <a
                                className="pool-link"
                                href={`https://sol.new/address/${pool.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                sol.new ↗
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="proto-actions">
                      {protocol.url && (
                        <a
                          href={protocol.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="protocol-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {protocol.linkText ||
                            protocol.url.replace(/^https?:\/\//, '')}{' '}
                          ↗
                        </a>
                      )}
                      <button
                        type="button"
                        className={`protocol-chart-toggle${isChartOpen ? ' open' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleProtocolChart(name);
                        }}
                      >
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
                                    title={fmtValue(d.tvl)}
                                  />
                                );
                              })
                            ) : (
                              <div className="empty-note">
                                No historical data yet
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="chart chart-panel">
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
                            const h =
                              chartMax > 0 ? (point.totalTvl / chartMax) * 100 : 0;
                            return (
                              <div
                                key={i}
                                className="chart-bar revealed"
                                style={{ height: `${h}%`, animationDelay: `${i * 0.03}s` }}
                                title={fmtValue(point.totalTvl)}
                              />
                            );
                          })
                        : loading
                          ? (
                              <div className="chart-loading">
                                <LoadOrb
                                  state="working"
                                  size={64}
                                  theme={lightMode ? 'light' : 'dark'}
                                  label="Loading TVL history"
                                />
                              </div>
                            )
                          : (
                              <div className="empty-note">No history yet</div>
                            )}
                    </div>
          <div className="chart-labels">
            <span className="chart-label">{chartStartLabel}</span>
            <span className="chart-label">{chartEndLabel}</span>
          </div>
        </div>

        <div className="follow-row">
          <div className="share-row" aria-label="Share">
            <button type="button" className="share-chip" onClick={() => openShare('x')}>
              Share on X
            </button>
            <button type="button" className="share-chip" onClick={() => openShare('telegram')}>
              Telegram
            </button>
            <button type="button" className={`share-chip${copied ? ' done' : ''}`} onClick={() => openShare('copy')}>
              {copied ? 'Copied!' : 'Copy stats'}
            </button>
          </div>
          <a
            className="follow-btn"
            href="https://x.com/shieldedsol"
            target="_blank"
            rel="noopener noreferrer"
          >
            Follow @shieldedsol
          </a>
        </div>

        <div className="subscribe-panel">
          {subscribeState === 'success' ? (
            <p className="subscribe-ok">Subscribed — we&apos;ll ping major TVL moves.</p>
          ) : (
            <form onSubmit={handleSubscribe} className="subscribe-form">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
              <button type="submit" disabled={subscribeState === 'loading'}>
                {subscribeState === 'loading' ? '...' : 'Subscribe'}
              </button>
            </form>
          )}
          {subscribeState === 'error' && (
            <p className="subscribe-err">Something went wrong. Try again.</p>
          )}
        </div>

        <DonationWallet />
      </main>

      <footer className="site-footer">
        <div className="footer-left">
          <button
            className={`refresh${loading ? ' is-loading' : ''}`}
            onClick={refresh}
            disabled={loading}
            type="button"
          >
            {loading ? (
              <LoadOrb
                state="connecting"
                size={20}
                theme={lightMode ? 'light' : 'dark'}
                label="Refreshing"
              />
            ) : null}
            {loading ? 'refreshing' : 'refresh'}
          </button>
          <span>
            {updatedLabel}
            {data?.cached ? ' · cached' : ''}
          </span>
        </div>
        <div className="footer-right">
          <a href="/history">history</a>
          <a href="/developers">developers</a>
          <a
            href="https://t.me/metasal"
            target="_blank"
            rel="noopener noreferrer"
          >
            + add protocol
          </a>
          <a
            href="https://metasal.xyz"
            target="_blank"
            rel="noopener noreferrer"
          >
            metasal.xyz
          </a>
        </div>
      </footer>
    </div>
  );
}
