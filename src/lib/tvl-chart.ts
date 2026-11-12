export type RawTvlPoint = {
  timestamp: string;
  totalTvl: number;
  protocols?: Record<string, number>;
};

export type TvlChartPoint = {
  t: number;
  tvl: number;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DROPOUT_RATIO = 0.8;
export function bucketSizeMs(rangeDays: number): number {
  return rangeDays <= 7 ? 4 * HOUR : DAY;
}

function median(values: number[]): number {
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function parseRaw(raw: RawTvlPoint[]): TvlChartPoint[] {
  const out: TvlChartPoint[] = [];
  for (const p of raw) {
    const t = Date.parse(p.timestamp);
    const tvl = Number(p.totalTvl);
    if (!Number.isFinite(t) || !Number.isFinite(tvl)) continue;
    out.push({ t, tvl });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function windowMedian(
  points: TvlChartPoint[],
  center: number,
  fromOffset: number,
  toOffset: number,
  floor: number
): number | null {
  const lo = center + fromOffset;
  const hi = center + toOffset;
  const vals: number[] = [];
  for (const p of points) {
    if (p.t >= lo && p.t <= hi && p.tvl >= floor) vals.push(p.tvl);
  }
  return vals.length >= 2 ? median(vals) : vals.length === 1 ? vals[0] : null;
}

/**
 * Drop zeros and transient / partial-sample spikes.
 * A point is a dropout if it sits well below the median of a flanking
 * lookback / lookahead window — so a 1–3 day collection failure that
 * later recovers is filled, but a sustained move is kept.
 */
export function filterDropouts(points: TvlChartPoint[]): TvlChartPoint[] {
  if (points.length === 0) return [];
  const positives = points.filter((p) => p.tvl > 0);
  if (positives.length === 0) return [];
  const globalMed = median(positives.map((p) => p.tvl));
  const hardFloor = Math.max(1, globalMed * 0.05);
  const candidates = positives.filter((p) => p.tvl >= hardFloor);
  if (candidates.length === 0) return [];

  const flank = 5 * DAY;
  const gap = 6 * HOUR;

  return candidates.filter((p, i) => {
    const before = windowMedian(candidates, p.t, -flank, -gap, hardFloor);
    const after = windowMedian(candidates, p.t, gap, flank, hardFloor);
    const refs = [before, after].filter((v): v is number => v != null);
    if (refs.length === 0) {
      const left = candidates[i - 1]?.tvl;
      const right = candidates[i + 1]?.tvl;
      if (left && right && p.tvl < DROPOUT_RATIO * Math.min(left, right)) {
        return false;
      }
      return true;
    }
    return p.tvl >= Math.min(...refs) * DROPOUT_RATIO;
  });
}

function lastInBucket(points: TvlChartPoint[], size: number): TvlChartPoint[] {
  const buckets = new Map<number, TvlChartPoint>();
  for (const p of points) {
    const key = Math.floor(p.t / size) * size;
    const prev = buckets.get(key);
    if (!prev || p.t >= prev.t) buckets.set(key, { t: key + size, tvl: p.tvl });
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
}

function forwardFill(
  points: TvlChartPoint[],
  size: number,
  endT: number
): TvlChartPoint[] {
  if (points.length === 0) return [];
  const start = points[0].t;
  const end = Math.max(endT, points[points.length - 1].t);
  const byTime = new Map(points.map((p) => [p.t, p.tvl]));
  const out: TvlChartPoint[] = [];
  let last = points[0].tvl;
  for (let t = start; t <= end + 1; t += size) {
    const v = byTime.get(t);
    if (v != null) last = v;
    out.push({ t, tvl: last });
  }
  return out;
}

export function prepareTvlSeries(
  raw: RawTvlPoint[],
  rangeDays: number,
  currentTvl?: number
): TvlChartPoint[] {
  const cleaned = filterDropouts(parseRaw(raw));
  if (cleaned.length === 0) return [];

  const size = bucketSizeMs(rangeDays);
  const now = Date.now();
  const rangeStart = now - rangeDays * DAY;
  const inRange = cleaned.filter((p) => p.t >= rangeStart - size);
  const source = inRange.length ? inRange : cleaned;

  let last = source[source.length - 1];
  if (
    currentTvl != null &&
    Number.isFinite(currentTvl) &&
    currentTvl > 0 &&
    // Don't append a live value that looks like another dropout.
    currentTvl >= last.tvl * DROPOUT_RATIO
  ) {
    const liveT = Math.max(now, last.t);
    if (liveT - last.t >= size / 4 || Math.abs(currentTvl - last.tvl) > last.tvl * 0.002) {
      source.push({ t: liveT, tvl: currentTvl });
      last = source[source.length - 1];
    }
  }

  const bucketed = filterDropouts(lastInBucket(source, size));
  if (bucketed.length === 0) return [];
  return forwardFill(bucketed, size, last.t);
}

export function seriesChange(points: TvlChartPoint[]): {
  first: number;
  last: number;
  pct: number | null;
} | null {
  if (points.length < 1) return null;
  const first = points[0].tvl;
  const last = points[points.length - 1].tvl;
  const pct = first > 0 ? ((last - first) / first) * 100 : null;
  return { first, last, pct };
}

/** Compact money labels like $1.8M / $120k. */
export function fmtCompactUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const trim = (s: string) => s.replace(/\.0$/, "");
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}$${trim(v >= 10 ? v.toFixed(1) : v.toFixed(1))}M`;
  }
  if (abs >= 1_000) {
    const v = abs / 1_000;
    const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1);
    return `${sign}$${trim(s)}k`;
  }
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function fmtCompactSol(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const trim = (s: string) => s.replace(/\.0$/, "");
  if (abs >= 1_000_000) return `${sign}${trim((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) {
    const v = abs / 1_000;
    const s = v >= 10 ? v.toFixed(0) : v.toFixed(1);
    return `${sign}${trim(s)}k`;
  }
  if (abs >= 10) return `${sign}${Math.round(abs)}`;
  return `${sign}${abs.toFixed(1)}`;
}

export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [min];
  const span = max - min;
  const raw = span / Math.max(1, target - 1);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / pow;
  const step =
    residual >= 7.5 ? 10 * pow : residual >= 3.5 ? 5 * pow : residual >= 1.5 ? 2 * pow : pow;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  // Avoid a runaway loop if step is 0.
  if (!(step > 0)) return [min, max];
  for (let v = start, i = 0; v <= max + step * 0.01 && i < 12; v += step, i++) {
    if (v >= min - step * 0.01) ticks.push(v);
  }
  return ticks.length ? ticks : [min, max];
}

export function paddedDomain(values: number[]): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1 };
  const span = hi - lo;
  const pad = span > 0 ? span * 0.1 : Math.max(hi * 0.05, 1);
  return {
    min: Math.max(0, lo - pad),
    max: hi + pad,
  };
}

/** Monotone cubic (Fritsch–Carlson) polyline as an SVG path, no overshoot. */
export function monotoneAreaPath(
  xs: number[],
  ys: number[],
  yBase: number
): { line: string; area: string } {
  const n = xs.length;
  if (n === 0) return { line: "", area: "" };
  if (n === 1) {
    const line = `M ${xs[0]} ${ys[0]}`;
    return {
      line,
      area: `${line} L ${xs[0]} ${yBase} L ${xs[0]} ${yBase} Z`,
    };
  }

  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    dy[i] = ys[i + 1] - ys[i];
    m[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else t[i] = (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-12) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const f = 3 / Math.sqrt(s);
      t[i] = f * a * m[i];
      t[i + 1] = f * b * m[i];
    }
  }

  let d = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    const x1 = xs[i] + h / 3;
    const y1 = ys[i] + (t[i] * h) / 3;
    const x2 = xs[i + 1] - h / 3;
    const y2 = ys[i + 1] - (t[i + 1] * h) / 3;
    d += ` C ${x1.toFixed(2)} ${y1.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}, ${xs[i + 1].toFixed(2)} ${ys[i + 1].toFixed(2)}`;
  }

  const area = `${d} L ${xs[n - 1].toFixed(2)} ${yBase.toFixed(2)} L ${xs[0].toFixed(2)} ${yBase.toFixed(2)} Z`;
  return { line: d, area };
}

export function pickXLabels(points: TvlChartPoint[], count = 5): TvlChartPoint[] {
  if (points.length <= count) return points;
  const out: TvlChartPoint[] = [];
  const last = points.length - 1;
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * last) / (count - 1));
    const p = points[idx];
    if (!out.length || out[out.length - 1].t !== p.t) out.push(p);
  }
  return out;
}

export function formatChartDate(t: number, rangeDays: number): string {
  const d = new Date(t);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  if (rangeDays <= 7) {
    const hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, "0");
    // Hourly-ish buckets: include time only when it isn't midnight, to keep axis labels short.
    if (hh === 0 && d.getMinutes() === 0) return `${month} ${day}`;
    return `${month} ${day}`;
  }
  return `${month} ${day}`;
}

export function formatTooltipDate(t: number, rangeDays: number): string {
  const d = new Date(t);
  const date = d.toLocaleString("en-US", { month: "short", day: "numeric" });
  if (rangeDays <= 7) {
    const time = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${date}, ${time}`;
  }
  return date;
}
