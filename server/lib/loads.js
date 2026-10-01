// Load calculation: percentages, RIR/RPE, fixed loads, rounding and e1RM estimates.

// %1RM by "effective reps" (reps performed + reps in reserve), in half steps from 1 to 15.5.
// This is the widely used RPE/RIR chart (RPE 10 = 0 RIR).
const EFFECTIVE_REPS_PCT = [
  [1, 100], [1.5, 97.8], [2, 95.5], [2.5, 93.9], [3, 92.2], [3.5, 90.7],
  [4, 89.2], [4.5, 87.8], [5, 86.3], [5.5, 85.0], [6, 83.7], [6.5, 82.4],
  [7, 81.1], [7.5, 79.9], [8, 78.6], [8.5, 77.4], [9, 76.2], [9.5, 75.1],
  [10, 73.9], [10.5, 72.3], [11, 70.7], [11.5, 69.4], [12, 68.0], [12.5, 66.7],
  [13, 65.3], [13.5, 64.0], [14, 62.6], [14.5, 61.3], [15, 59.9], [15.5, 58.6],
];

/** Percent of 1RM (0-100) a lifter can use for `reps` leaving `rir` reps in reserve. */
export function pctForRepsRir(reps, rir = 0) {
  const e = Math.max(1, Number(reps) + Number(rir || 0));
  const last = EFFECTIVE_REPS_PCT[EFFECTIVE_REPS_PCT.length - 1];
  if (e >= last[0]) {
    // Extrapolate ~2.6% per extra effective rep beyond the chart, floor at 30%.
    return Math.max(30, last[1] - (e - last[0]) * 2.6);
  }
  for (let i = 0; i < EFFECTIVE_REPS_PCT.length - 1; i++) {
    const [e0, p0] = EFFECTIVE_REPS_PCT[i];
    const [e1, p1] = EFFECTIVE_REPS_PCT[i + 1];
    if (e >= e0 && e <= e1) return p0 + ((e - e0) / (e1 - e0)) * (p1 - p0);
  }
  return 100;
}

/** Estimated 1RM from a set of `weight` x `reps` with `rir` in reserve. */
export function estimate1RM(weight, reps, rir = 0) {
  if (!weight || !reps) return null;
  return weight / (pctForRepsRir(reps, rir) / 100);
}

export function roundTo(value, increment = 2.5) {
  if (value == null || Number.isNaN(value)) return null;
  const inc = Number(increment) || 2.5;
  return Math.round(value / inc) * inc;
}

/** Parse a rep prescription like "5", "3-5", "8,6,4" or "AMRAP" into a number for load maths. */
export function parseReps(reps) {
  if (reps == null || reps === '') return null;
  const s = String(reps).trim();
  const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return Number(range[1]); // load for the low end of the range
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Work out the target load for a prescription for a specific athlete.
 * @param {object} rx        prescription row
 * @param {object} state     { max, load_offset } for the athlete + exercise (max may be null)
 * @param {number} increment rounding increment in kg
 * @returns {{ load: number|null, basis: string }}
 */
export function targetLoad(rx, state = {}, increment = 2.5) {
  const max = state.max ?? null;
  const offset = Number(state.load_offset || 0);
  const reps = parseReps(rx.reps);
  let raw = null;
  let basis = '';

  switch (rx.load_type) {
    case 'percent':
      if (max && rx.percent) {
        raw = (max * rx.percent) / 100;
        basis = `${rx.percent}% of ${round1(max)}`;
      } else basis = max ? 'no % set' : 'needs max';
      break;
    case 'rir':
    case 'rpe': {
      const rir = rx.load_type === 'rpe' ? 10 - Number(rx.rpe ?? 10) : Number(rx.rir ?? 0);
      if (max && reps) {
        const pct = pctForRepsRir(reps, rir);
        raw = (max * pct) / 100;
        basis = `${reps} reps @ ${rir} RIR ≈ ${round1(pct)}% of ${round1(max)}`;
      } else basis = max ? 'needs reps' : 'needs max';
      break;
    }
    case 'fixed':
      if (rx.fixed_load != null) {
        raw = Number(rx.fixed_load);
        basis = 'fixed';
      }
      break;
    default:
      return { load: null, basis: rx.load_type === 'bodyweight' ? 'bodyweight' : '' };
  }

  if (raw == null) return { load: null, basis };
  if (offset) basis += ` ${offset > 0 ? '+' : '−'} ${Math.abs(offset)}kg adj.`;
  return { load: roundTo(raw + offset, increment), basis };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
