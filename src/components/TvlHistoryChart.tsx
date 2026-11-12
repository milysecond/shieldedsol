"use client";

import { useId, useMemo, useState, type MouseEvent, type TouchEvent } from "react";
import {
  fmtCompactSol,
  fmtCompactUsd,
  formatChartDate,
  formatTooltipDate,
  monotoneAreaPath,
  niceTicks,
  paddedDomain,
  pickXLabels,
  prepareTvlSeries,
  seriesChange,
  type RawTvlPoint,
} from "@/lib/tvl-chart";

type Props = {
  points: RawTvlPoint[];
  rangeDays: number;
  currentTvl?: number;
  unit: "usd" | "sol";
  solPrice?: number;
  formatValue: (n: number) => string;
};

const VB = { w: 640, h: 200 };
const PAD = { l: 46, r: 14, t: 12, b: 28 };

export default function TvlHistoryChart({
  points,
  rangeDays,
  currentTvl,
  unit,
  solPrice = 0,
  formatValue,
}: Props) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(() => {
    const prepared = prepareTvlSeries(points, rangeDays, currentTvl);
    if (unit !== "sol") return prepared;
    if (!solPrice || solPrice <= 0) return prepared.map((p) => ({ ...p, tvl: 0 }));
    return prepared.map((p) => ({ ...p, tvl: p.tvl / solPrice }));
  }, [points, rangeDays, currentTvl, unit, solPrice]);

  const change = useMemo(() => seriesChange(series), [series]);

  const layout = useMemo(() => {
    if (series.length === 0) return null;
    const { min, max } = paddedDomain(series.map((p) => p.tvl));
    const ticks = niceTicks(min, max, 4);
    const yMin = Math.min(min, ticks[0] ?? min);
    const yMax = Math.max(max, ticks[ticks.length - 1] ?? max);
    const ySpan = yMax - yMin || 1;
    const t0 = series[0].t;
    const t1 = series[series.length - 1].t;
    const tSpan = t1 - t0 || 1;
    const innerW = VB.w - PAD.l - PAD.r;
    const innerH = VB.h - PAD.t - PAD.b;
    const xAt = (t: number) => PAD.l + ((t - t0) / tSpan) * innerW;
    const yAt = (v: number) => PAD.t + innerH - ((v - yMin) / ySpan) * innerH;
    const xs = series.map((p) => xAt(p.t));
    const ys = series.map((p) => yAt(p.tvl));
    const { line, area } = monotoneAreaPath(xs, ys, PAD.t + innerH);
    const xLabels = pickXLabels(series, 5);
    return { yMin, yMax, ticks, xAt, yAt, line, area, xLabels, innerH };
  }, [series]);

  const fmtAxis = (n: number) =>
    unit === "sol" ? fmtCompactSol(n) : fmtCompactUsd(n);

  const onMove = (e: MouseEvent<SVGSVGElement> | TouchEvent<SVGSVGElement>) => {
    if (!layout || series.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX =
      "touches" in e
        ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX
        : e.clientX;
    if (clientX == null) return;
    const x = ((clientX - rect.left) / rect.width) * VB.w;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(layout.xAt(series[i].t) - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover(best);
  };

  const hoverPoint = hover != null ? series[hover] : null;
  const last = series[series.length - 1];
  const pct = change?.pct ?? null;
  const pctText =
    pct == null
      ? null
      : `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}%`;

  return (
    <div className="tvl-chart">
      <div className="tvl-chart-stats">
        {last ? (
          <>
            <span className="tvl-chart-current">{formatValue(last.tvl)}</span>
            {pctText && change ? (
              <span
                className={`tvl-change ${
                  (change.pct ?? 0) >= 0 ? "up" : "down"
                }`}
              >
                {pctText}
              </span>
            ) : null}
          </>
        ) : (
          <span className="tvl-chart-empty">no history yet</span>
        )}
      </div>

      {layout && series.length > 0 ? (
        <div className="tvl-chart-plot">
          <svg
            className="tvl-chart-svg"
            viewBox={`0 0 ${VB.w} ${VB.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`TVL history over ${rangeDays} days`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onTouchStart={onMove}
            onTouchMove={onMove}
            onTouchEnd={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`tvlFill-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {layout.ticks.map((tick) => {
              const y = layout.yAt(tick);
              return (
                <g key={tick}>
                  <line
                    className="tvl-chart-grid"
                    x1={PAD.l}
                    x2={VB.w - PAD.r}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="tvl-chart-ylabel"
                    x={PAD.l - 8}
                    y={y}
                    dy="0.35em"
                    textAnchor="end"
                  >
                    {fmtAxis(tick)}
                  </text>
                </g>
              );
            })}

            <path d={layout.area} fill={`url(#tvlFill-${gid})`} />
            <path
              d={layout.line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {layout.xLabels.map((p, i, arr) => (
              <text
                key={p.t}
                className="tvl-chart-xlabel"
                x={layout.xAt(p.t)}
                y={VB.h - 8}
                textAnchor={
                  i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"
                }
              >
                {formatChartDate(p.t, rangeDays)}
              </text>
            ))}

            {hoverPoint && (
              <g className="tvl-chart-crosshair">
                <line
                  x1={layout.xAt(hoverPoint.t)}
                  x2={layout.xAt(hoverPoint.t)}
                  y1={PAD.t}
                  y2={PAD.t + layout.innerH}
                />
                <circle
                  cx={layout.xAt(hoverPoint.t)}
                  cy={layout.yAt(hoverPoint.tvl)}
                  r="3.5"
                  fill="var(--accent)"
                  stroke="var(--bg)"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </svg>

          {hoverPoint && layout && (
            <div
              className="tvl-chart-tooltip"
              style={{
                left: `${Math.min(92, Math.max(8, (layout.xAt(hoverPoint.t) / VB.w) * 100))}%`,
              }}
            >
              <div className="tvl-chart-tip-date">
                {formatTooltipDate(hoverPoint.t, rangeDays)}
              </div>
              <div className="tvl-chart-tip-val">
                {formatValue(hoverPoint.tvl)}
                {unit === "sol" ? " SOL" : ""}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="tvl-chart-placeholder">no history for this range</div>
      )}
    </div>
  );
}
