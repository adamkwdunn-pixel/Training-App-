// Effort maths shared by the server (planned loads, e1RM) and the app (in-session weight adjustments).

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

/** Target RIR for a prescription: RPE converts as RIR = 10 − RPE. Null when the coach set no effort target. */
export function targetRirOf(rx) {
  if (rx.load_type === 'rpe' && rx.rpe != null && rx.rpe !== '') return 10 - Number(rx.rpe);
  if (rx.rir != null && rx.rir !== '') return Number(rx.rir);
  if (rx.rpe != null && rx.rpe !== '') return 10 - Number(rx.rpe);
  return null;
}

/** "6-10" -> [6, 10], "5" -> [5, 5], otherwise null. */
export function repRange(reps) {
  const s = String(reps ?? '').trim();
  const m = s.match(/^(\d+)\s*(?:-|–|to)\s*(\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])].sort((a, b) => a - b);
  const n = s.match(/^(\d+)$/);
  return n ? [Number(n[1]), Number(n[1])] : null;
}

// In-session (tactical) adjustment settings. See docs/IN-SESSION-ADJUSTMENTS.md for the reasoning.
export const AUTOREG_DEFAULTS = {
  enabled: true,
  max_change_pct: 10,   // never move the bar more than this between two sets
  deadband_rir: 1,      // RIR ratings are typically within ~1 rep, so smaller misses are left alone
  max_up_rir: 3,        // ratings far from failure are least accurate: count at most 3 RIR "too easy"
  up_damping: 0.75,     // fatigue builds set to set, so only take 3/4 of an increase
};

/**
 * Weight for the next set, from the set just done.
 * @param {object} set  { weight, reps, rir } as logged
 * @param {object} rx   prescription { reps, rir, rpe, load_type }
 * @param {object} opts { increment, ...AUTOREG_DEFAULTS }
 * @returns {null | { load, change_kg, change_pct, direction: 'up'|'down'|'hold', reason }}
 *          null when there's nothing to go on (no effort target, or the set is missing weight/reps/RIR).
 */
export function nextSetLoad(set, rx, opts = {}) {
  const o = { ...AUTOREG_DEFAULTS, ...opts };
  if (!o.enabled) return null;
  const targetRir = targetRirOf(rx);
  const range = repRange(rx.reps);
  const w = Number(set.weight);
  const reps = Number(set.reps);
  if (targetRir == null || !range || !(w > 0) || !(reps > 0) || set.rir === '' || set.rir == null) return null;
  const rir = Number(set.rir);
  const [lo, hi] = range;
  const increment = Number(o.increment) || 2.5;
  const rangeText = lo === hi ? `${lo}` : `${lo}-${hi}`;
  const missRir = rir - targetRir; // + easier than planned, − harder
  const inRange = reps >= lo && reps <= hi;

  if (inRange && Math.abs(missRir) < o.deadband_rir) {
    return { load: w, change_kg: 0, change_pct: 0, direction: 'hold', reason: `On target (${reps} reps @ ${rir} RIR) — keep ${w} kg` };
  }

  // Aim the next set at the reps just done (kept inside the range) at the target RIR.
  const aimReps = Math.min(hi, Math.max(lo, reps));
  // Too easy: cap how far above target we believe, then damp the increase for fatigue.
  const usedRir = missRir > 0 ? Math.min(rir, targetRir + o.max_up_rir) : rir;
  let ratio = pctForRepsRir(aimReps, targetRir) / pctForRepsRir(reps, usedRir);
  if (ratio > 1) ratio = 1 + (ratio - 1) * o.up_damping;
  const cap = o.max_change_pct / 100;
  ratio = Math.min(1 + cap, Math.max(1 - cap, ratio));

  let load = roundTo(w * ratio, increment);
  // A real miss should always move the bar at least one plate step, if that stays within the cap.
  if (load === w && Math.abs(w * ratio - w) >= increment * 0.4) {
    const step = ratio > 1 ? increment : -increment;
    if (Math.abs(step) / w <= cap) load = w + step;
  }
  // Never round past the cap.
  while (load > w * (1 + cap) + 1e-9) load -= increment;
  while (load < w * (1 - cap) - 1e-9) load += increment;
  load = Math.max(0, Math.round(load * 100) / 100);

  const change = Math.round((load - w) * 100) / 100;
  const pct = Math.round((change / w) * 1000) / 10;
  const why = reps < lo ? `only ${reps} reps (aim ${rangeText})`
    : reps > hi ? `${reps} reps — past the top of ${rangeText}`
    : missRir < 0 ? `${rir} RIR — harder than the ${targetRir} RIR target`
    : `${rir} RIR — easier than the ${targetRir} RIR target`;
  if (change === 0) return { load: w, change_kg: 0, change_pct: 0, direction: 'hold', reason: `${cap1(why)} — change too small to load, keep ${w} kg` };
  return {
    load, change_kg: change, change_pct: pct, direction: change > 0 ? 'up' : 'down',
    reason: `${cap1(why)} → ${change > 0 ? '+' : '−'}${Math.abs(change)} kg (${change > 0 ? '+' : '−'}${Math.abs(pct)}%)`,
  };
}

const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
