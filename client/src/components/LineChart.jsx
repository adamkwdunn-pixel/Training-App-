/** Responsive SVG line chart with a soft fill and an optional dashed target line. */
export default function LineChart({ points, yKey, label, lowerIsBetter = false, unit = '', target, xKey = 'date' }) {
  const data = points.filter((p) => p[yKey] != null);
  if (data.length === 0) return <p className="muted small">No {label.toLowerCase()} data yet.</p>;
  const W = 600;
  const H = 210;
  const pad = { l: 44, r: 12, t: 14, b: 26 };
  const ys = data.map((p) => p[yKey]);
  let min = Math.min(...ys, ...(target != null ? [target] : []));
  let max = Math.max(...ys, ...(target != null ? [target] : []));
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.12;
  max += span * 0.12;
  const x = (i) => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const path = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[yKey]).toFixed(1)}`).join(' ');
  const area = `${path} L${x(data.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const first = ys[0];
  const last = ys[ys.length - 1];
  const delta = last - first;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const ticks = [min + (max - min) * 0.12, (min + max) / 2, max - (max - min) * 0.12];
  const r1 = (n) => Math.round(n * 100) / 100;
  const short = (d) => (typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : d);

  return (
    <figure className="chart">
      <figcaption>
        <span className="muted small">{label}</span>
        <span className="chart-latest">
          {r1(last)}{unit}
          {data.length > 1 && delta !== 0 && (
            <span className={good ? 'up' : 'down'}> {delta > 0 ? '▲' : '▼'} {r1(Math.abs(delta))}</span>
          )}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} over time`}>
        <defs>
          <linearGradient id="chartFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 10) / 10}</text>
          </g>
        ))}
        {target != null && <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} className="target-line" />}
        {data.length > 1 && <path d={area} className="area" />}
        <path d={path} className="line" />
        {data.map((p, i) => (
          <circle key={`${p[xKey]}${i}`} cx={x(i)} cy={y(p[yKey])} r={data.length > 30 ? 2 : 3.5} className="dot">
            <title>{`${p[xKey]}: ${r1(p[yKey])}${unit}`}</title>
          </circle>
        ))}
        <text x={pad.l} y={H - 6} className="axis">{short(data[0][xKey])}</text>
        {data.length > 1 && <text x={W - pad.r} y={H - 6} textAnchor="end" className="axis">{short(data[data.length - 1][xKey])}</text>}
      </svg>
    </figure>
  );
}
