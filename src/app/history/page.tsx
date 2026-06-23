'use client';

import { useState, useEffect, useCallback } from 'react';

interface HistoryPoint {
  timestamp: string;
  totalTvl: number;
  protocols?: Record<string, number>;
}
interface ProtocolHistoryPoint {
  timestamp: string;
  tvl: number;
}
interface ProtocolInfo {
  name: string;
  tvl: number;
}

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null || isNaN(n)) return '--';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '$--';
  return '$' + fmt(n);
}

export default function HistoryPage() {
  const [mainPeriod, setMainPeriod] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [mainHistory, setMainHistory] = useState<HistoryPoint[]>([]);
  const [protocols, setProtocols] = useState<ProtocolInfo[]>([]);
  const [protocolCharts, setProtocolCharts] = useState<Record<string, ProtocolHistoryPoint[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchMainChart = useCallback(async (period: string) => {
    try {
      const res = await fetch(`/api/history/tvl?range=${period}`);
      const data = await res.json();
      setMainHistory(data.history || []);
      setLoading(false);
    } catch (e) {
      console.error('Main chart fetch error:', e);
      setLoading(false);
    }
  }, []);

  const fetchProtocols = useCallback(async () => {
    try {
      const res = await fetch('/api/protocols');
      const data = await res.json();
      const prots: ProtocolInfo[] = (data.protocols || []).map((p: any) => ({
        name: p.name,
        tvl: p.tvl || 0,
      }));
      setProtocols(prots);

      // Fetch mini charts for each protocol
      const chartPromises = prots.map(async (p) => {
        try {
          const res = await fetch(`/api/history/protocol?protocol=${encodeURIComponent(p.name)}&range=7d`);
          const data = await res.json();
          return { name: p.name, history: data.history || [] };
        } catch {
          return { name: p.name, history: [] };
        }
      });
      const charts = await Promise.all(chartPromises);
      const chartMap: Record<string, ProtocolHistoryPoint[]> = {};
      charts.forEach((c) => { chartMap[c.name] = c.history; });
      setProtocolCharts(chartMap);
    } catch (e) {
      console.error('Protocols fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchMainChart(mainPeriod);
    fetchProtocols();
  }, [fetchMainChart, fetchProtocols, mainPeriod]);

  const handleSetPeriod = useCallback((period: '24h' | '7d' | '30d' | '90d') => {
    setMainPeriod(period);
    fetchMainChart(period);
  }, [fetchMainChart]);

  // Stats calculations
  const currentTvl = mainHistory.length > 0 ? mainHistory[mainHistory.length - 1].totalTvl : null;
  const avg7d = mainHistory.length > 0
    ? mainHistory.slice(-7).reduce((sum, d) => sum + d.totalTvl, 0) / Math.min(7, mainHistory.length)
    : null;
  const avg30d = mainHistory.length > 0
    ? mainHistory.slice(-30).reduce((sum, d) => sum + d.totalTvl, 0) / Math.min(30, mainHistory.length)
    : null;
  const ath = mainHistory.length > 0 ? Math.max(...mainHistory.map((d) => d.totalTvl)) : null;

  let tvlChangeText = '';
  let tvlChangeClass = '';
  if (mainHistory.length >= 2 && currentTvl) {
    const previous = mainHistory[0].totalTvl;
    if (previous > 0) {
      const change = ((currentTvl - previous) / previous) * 100;
      const arrow = change >= 0 ? '\u2191' : '\u2193';
      tvlChangeText = `${arrow} ${Math.abs(change).toFixed(2)}% since ${mainPeriod}`;
      tvlChangeClass = change >= 0 ? 'up' : 'down';
    }
  }

  // Chart rendering
  const chartMax = mainHistory.length > 0 ? Math.max(...mainHistory.map((d) => d.totalTvl)) : 0;
  const chartStartLabel = mainHistory.length > 0 ? new Date(mainHistory[0].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--';
  const chartEndLabel = mainHistory.length > 0 ? new Date(mainHistory[mainHistory.length - 1].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--';

  return (
    <div className="history-container" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <header className="history-header">
        <h1>
          <img src="/logo.svg" alt="Shielded Sol" className="logo" style={{ width: 32, height: 32 }} />
          TVL History
        </h1>
        <a href="/" className="back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </a>
      </header>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Current TVL</div>
          <div className={`stat-value${loading ? ' loading' : ''}`}>{currentTvl != null ? fmtUsd(currentTvl) : '$--'}</div>
          {tvlChangeText && <div className={`stat-change ${tvlChangeClass}`}>{tvlChangeText}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">7-Day Average</div>
          <div className={`stat-value${loading ? ' loading' : ''}`}>{avg7d != null ? fmtUsd(avg7d) : '$--'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">30-Day Average</div>
          <div className={`stat-value${loading ? ' loading' : ''}`}>{avg30d != null ? fmtUsd(avg30d) : '$--'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">All-Time High</div>
          <div className={`stat-value${loading ? ' loading' : ''}`}>{ath != null ? fmtUsd(ath) : '$--'}</div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="section">
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Value Locked</div>
            <div className="chart-tabs">
              {(['24h', '7d', '30d', '90d'] as const).map((period) => (
                <button
                  key={period}
                  className={`chart-tab${mainPeriod === period ? ' active' : ''}`}
                  onClick={() => handleSetPeriod(period)}
                  style={{ fontSize: '0.625rem', padding: '0.375rem 0.75rem', borderRadius: 4 }}
                >
                  {period.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="history-chart-container">
            {mainHistory.length > 0
              ? mainHistory.map((point, i) => {
                  const h = chartMax > 0 ? (point.totalTvl / chartMax) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="history-chart-bar"
                      style={{ height: `${h}%` }}
                      title={fmtUsd(point.totalTvl)}
                    />
                  );
                })
              : !loading && (
                  <div style={{ color: 'var(--text4)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
                    No data available yet. Run the cron job to start collecting data.
                  </div>
                )}
          </div>
          <div className="chart-labels">
            <span className="chart-label">{chartStartLabel}</span>
            <span className="chart-label">{chartEndLabel}</span>
          </div>
        </div>
      </div>

      {/* Protocol Breakdown */}
      <div className="section">
        <div className="section-title">Protocol Breakdown</div>
        <div className="protocol-list">
          {protocols.map((p) => {
            const chartData = protocolCharts[p.name] || [];
            const protoMax = chartData.length > 0 ? Math.max(...chartData.map((d) => d.tvl)) : 0;
            return (
              <div key={p.name} className="protocol-item">
                <div className="protocol-item-header">
                  <span className="protocol-item-name">{p.name}</span>
                  <span className="protocol-item-tvl">{fmtUsd(p.tvl)}</span>
                </div>
                {chartData.length > 0 && (
                  <div className="protocol-mini-chart">
                    {chartData.map((d, i) => {
                      const h = protoMax > 0 ? (d.tvl / protoMax) * 100 : 0;
                      return (
                        <div
                          key={i}
                          className="mini-bar"
                          style={{ height: `${h}%` }}
                          title={fmtUsd(d.tvl)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="history-footer">
        Last updated: {new Date().toLocaleTimeString()} &middot;{' '}
        <a href="https://x.com/shieldedsol" target="_blank" rel="noopener noreferrer">@shieldedsol</a>
      </div>
    </div>
  );
}
