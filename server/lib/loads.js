// Load calculation: percentages, RIR/RPE, fixed loads, rounding and e1RM estimates.

import { pctForRepsRir, estimate1RM, roundTo } from '../../shared/effort.js';

export { pctForRepsRir, estimate1RM, roundTo };

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
