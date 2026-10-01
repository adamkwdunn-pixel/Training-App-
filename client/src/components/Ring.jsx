/** Circular progress ring (e.g. calories eaten vs target). */
export default function Ring({ value, max, children, size = 132, stroke = 10 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

export function Bar({ value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return <div className={`bar ${pct > 110 ? 'over' : ''}`}><div style={{ width: `${Math.min(100, pct)}%` }} /></div>;
}

export function ScoreChip({ score }) {
  if (score == null) return <span className="score none">—</span>;
  const tone = score >= 70 ? 'good' : score >= 50 ? 'mid' : 'low';
  return <span className={`score ${tone}`}>{score}</span>;
}
