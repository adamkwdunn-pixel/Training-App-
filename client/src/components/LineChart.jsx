/** Small responsive SVG line chart for progress over time. */
export default function LineChart({ points, yKey, label, lowerIsBetter = false, unit = '' }) {
  const data = points.filter((p) => p[yKey] != null);
  if (data.length === 0) return <p className="muted small">No {label.toLowerCase()} data yet.</p>;
  const W = 600;
  const H = 200;
  const pad = { l: 44, r: 12, t: 14, b: 26 };
  const ys = data.map((p) => p[yKey]);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;
  const x = (i) => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const path = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[yKey]).toFixed(1)}`).join(' ');
  const first = ys[0];
  const last = ys[ys.length - 1];
  const delta = last - first;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1];
  const r1 = (n) => Math.round(n * 100) / 100;

  return (
    <figure className="chart">
      <figcaption>
        <span>{label}</span>
        <span className="chart-latest">
          {r1(last)}{unit}
          {data.length > 1 && delta !== 0 && (
            <span className={good ? 'up' : 'down'}> {delta > 0 ? '▲' : '▼'} {r1(Math.abs(delta))}{unit}</span>
          )}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} over time`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 10) / 10}</text>
          </g>
        ))}
        <path d={path} className="line" />
        {data.map((p, i) => (
          <circle key={p.date + i} cx={x(i)} cy={y(p[yKey])} r={data.length > 30 ? 2 : 4} className="dot">
            <title>{`${p.date}: ${r1(p[yKey])}${unit}`}</title>
          </circle>
        ))}
        <text x={pad.l} y={H - 6} className="axis">{data[0].date}</text>
        {data.length > 1 && <text x={W - pad.r} y={H - 6} textAnchor="end" className="axis">{data[data.length - 1].date}</text>}
      </svg>
    </figure>
  );
}
