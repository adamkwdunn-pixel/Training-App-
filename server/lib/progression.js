// Coach-defined progression rules.
//
// A rule set is JSON the coach builds in the app:
// {
//   "clauses": [
//     { "label": "Easy day", "when": [{ "metric": "all_reps_completed", "op": "==", "value": 1 },
//                                     { "metric": "rir_vs_target", "op": ">=", "value": 1 }],
//       "then": [{ "action": "adjust_load_kg", "value": 5 }] },
//     ...
//   ],
//   "otherwise": [{ "action": "hold" }]
// }
// Clauses are checked top to bottom; the first one whose conditions all pass is applied.

import { estimate1RM, parseReps } from './loads.js';

export const METRICS = {
  all_reps_completed: 'All prescribed sets & reps completed (1 = yes, 0 = no)',
  reps_missed: 'Total reps missed vs prescription',
  sets_completed: 'Sets logged',
  avg_rir: 'Average RIR reported',
  min_rir: 'Lowest RIR reported (hardest set)',
  last_set_rir: 'RIR on the last set',
  rir_vs_target: 'Average RIR minus target RIR (+ = felt easier than planned)',
  top_set_weight: 'Heaviest weight used (kg)',
  e1rm: 'Best estimated 1RM this session (kg)',
  e1rm_vs_max_pct: 'Best e1RM vs current max, in % (+ = stronger)',
  success_streak: 'Successful sessions in a row (incl. this one)',
  fail_streak: 'Unsuccessful sessions in a row (incl. this one)',
  best_time: 'Best time (s) — speed / conditioning',
  time_vs_target_pct: 'Best time vs target time, in % (− = faster than target)',
  best_result: 'Best distance / height / velocity result',
  session_count: 'Times this exercise has been logged by the athlete',
};

export const OPS = ['>=', '<=', '>', '<', '==', '!='];

export const ACTIONS = {
  hold: 'Hold — no change',
  adjust_load_kg: 'Change working load by X kg (next session)',
  adjust_load_pct: 'Change working load by X % (next session)',
  adjust_max_kg: 'Change 1RM / training max by X kg',
  adjust_max_pct: 'Change 1RM / training max by X %',
  max_from_e1rm: 'Set max to this session’s best e1RM (if higher)',
  reset_load_adjustment: 'Reset load adjustment to 0',
  reset_streaks: 'Reset success / fail streaks',
  flag_coach: 'Flag for coach review (with message)',
};

/**
 * Summarise one prescription's logged sets into the metrics rules can use.
 * @param {object} rx    prescription { sets, reps, rir, rpe, load_type, target_value }
 * @param {Array}  sets  logged sets [{ weight, reps, rir, time_seconds, result }]
 * @param {object} state current athlete/exercise state { max, success_streak, fail_streak, session_count }
 */
export function computeMetrics(rx, sets, state = {}) {
  const targetReps = parseReps(rx.reps);
  const targetSets = Number(rx.sets) || sets.length;
  const done = sets.filter((s) => s.reps != null || s.time_seconds != null || s.result != null || s.weight != null);

  // Rep counting only applies to loaded / rep-based work; sprint & jump rows are one effort each.
  const countsReps = !rx.metric || rx.metric === 'load' || rx.metric === 'reps';
  let repsMissed = 0;
  if (targetReps && countsReps) {
    for (let i = 0; i < targetSets; i++) {
      const s = done[i];
      repsMissed += Math.max(0, targetReps - Number(s?.reps ?? 0));
    }
  }
  const allDone = done.length >= targetSets && repsMissed === 0;

  const rirs = done.map((s) => s.rir).filter((v) => v != null && v !== '').map(Number);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const targetRir = rx.load_type === 'rpe' && rx.rpe != null ? 10 - Number(rx.rpe) : rx.rir != null ? Number(rx.rir) : null;

  const weights = done.map((s) => Number(s.weight)).filter((w) => w > 0);
  const e1rms = done
    .map((s) => estimate1RM(Number(s.weight), Number(s.reps), s.rir != null && s.rir !== '' ? Number(s.rir) : 0))
    .filter((v) => v);
  const bestE1rm = e1rms.length ? Math.max(...e1rms) : null;

  const times = done.map((s) => Number(s.time_seconds)).filter((t) => t > 0);
  const bestTime = times.length ? Math.min(...times) : null;
  const results = done.map((s) => Number(s.result)).filter((r) => !Number.isNaN(r) && r !== 0);

  return {
    all_reps_completed: allDone ? 1 : 0,
    reps_missed: repsMissed,
    sets_completed: done.length,
    avg_rir: avg(rirs),
    min_rir: rirs.length ? Math.min(...rirs) : null,
    last_set_rir: rirs.length ? rirs[rirs.length - 1] : null,
    rir_vs_target: rirs.length && targetRir != null ? avg(rirs) - targetRir : null,
    top_set_weight: weights.length ? Math.max(...weights) : null,
    e1rm: bestE1rm,
    e1rm_vs_max_pct: bestE1rm && state.max ? ((bestE1rm - state.max) / state.max) * 100 : null,
    success_streak: allDone ? (state.success_streak || 0) + 1 : 0,
    fail_streak: allDone ? 0 : (state.fail_streak || 0) + 1,
    best_time: bestTime,
    time_vs_target_pct: bestTime && rx.target_value ? ((bestTime - rx.target_value) / rx.target_value) * 100 : null,
    best_result: results.length ? Math.max(...results) : null,
    session_count: (state.session_count || 0) + 1,
  };
}

function compare(a, op, b) {
  if (a == null) return false; // missing data never satisfies a condition
  switch (op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    case '==': return a == b; // eslint-disable-line eqeqeq
    case '!=': return a != b; // eslint-disable-line eqeqeq
    default: return false;
  }
}

/**
 * Apply a rule set to the metrics from a session.
 * @param {object} rule      { clauses, otherwise }
 * @param {object} metrics   from computeMetrics
 * @param {object} state     { max, load_offset, success_streak, fail_streak, session_count }
 * @param {object} ctx       { lastLoad } the load prescribed this session (for % load changes)
 * @returns {{ state: object, matched: string, changes: string[], flags: string[] }}
 */
export function applyRule(rule, metrics, state, ctx = {}) {
  const next = {
    max: state.max ?? null,
    load_offset: Number(state.load_offset || 0),
    success_streak: metrics.success_streak,
    fail_streak: metrics.fail_streak,
    session_count: metrics.session_count,
  };
  const changes = [];
  const flags = [];

  const clauses = Array.isArray(rule?.clauses) ? rule.clauses : [];
  let actions = rule?.otherwise || [];
  let matched = 'otherwise';
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    const conds = Array.isArray(c.when) ? c.when : [];
    if (conds.every((w) => compare(metrics[w.metric], w.op, Number(w.value)))) {
      actions = c.then || [];
      matched = c.label || `Clause ${i + 1}`;
      break;
    }
  }

  for (const a of actions) {
    const v = Number(a.value || 0);
    switch (a.action) {
      case 'adjust_load_kg':
        next.load_offset += v;
        changes.push(`Load ${sign(v)}${v} kg`);
        break;
      case 'adjust_load_pct': {
        const base = ctx.lastLoad || metrics.top_set_weight;
        if (base) {
          const kg = Math.round(((base * v) / 100) * 100) / 100;
          next.load_offset += kg;
          changes.push(`Load ${sign(v)}${v}% (${sign(kg)}${kg} kg)`);
        }
        break;
      }
      case 'adjust_max_kg':
        if (next.max != null) {
          next.max += v;
          changes.push(`Max ${sign(v)}${v} kg → ${fmt(next.max)}`);
        }
        break;
      case 'adjust_max_pct':
        if (next.max != null) {
          next.max *= 1 + v / 100;
          changes.push(`Max ${sign(v)}${v}% → ${fmt(next.max)}`);
        }
        break;
      case 'max_from_e1rm':
        if (metrics.e1rm && (next.max == null || metrics.e1rm > next.max)) {
          next.max = Math.round(metrics.e1rm * 10) / 10;
          changes.push(`Max set from e1RM → ${fmt(next.max)}`);
        }
        break;
      case 'reset_load_adjustment':
        if (next.load_offset !== 0) changes.push('Load adjustment reset');
        next.load_offset = 0;
        break;
      case 'reset_streaks':
        next.success_streak = 0;
        next.fail_streak = 0;
        changes.push('Streaks reset');
        break;
      case 'flag_coach':
        flags.push(a.message || matched);
        break;
      default:
        break;
    }
  }

  return { state: next, matched, changes, flags };
}

function sign(v) {
  return v >= 0 ? '+' : '';
}
function fmt(n) {
  return `${Math.round(n * 10) / 10} kg`;
}

// Ready-made rule sets the coach can start from and edit.
export const PRESET_RULES = [
  {
    name: 'RIR-guided double progression',
    description: 'Add load when all reps are done with reps to spare; back off after a rough session.',
    config: {
      clauses: [
        { label: 'Too easy', when: [{ metric: 'all_reps_completed', op: '==', value: 1 }, { metric: 'rir_vs_target', op: '>=', value: 2 }], then: [{ action: 'adjust_load_kg', value: 5 }] },
        { label: 'On target', when: [{ metric: 'all_reps_completed', op: '==', value: 1 }, { metric: 'rir_vs_target', op: '>=', value: 0 }], then: [{ action: 'adjust_load_kg', value: 2.5 }] },
        { label: 'Missed reps', when: [{ metric: 'reps_missed', op: '>=', value: 3 }], then: [{ action: 'adjust_load_pct', value: -5 }] },
      ],
      otherwise: [{ action: 'hold' }],
    },
  },
  {
    name: 'Linear progression with deload',
    description: '+2.5 kg every successful session; 10% deload after 2 failed sessions in a row.',
    config: {
      clauses: [
        { label: 'Success', when: [{ metric: 'all_reps_completed', op: '==', value: 1 }], then: [{ action: 'adjust_load_kg', value: 2.5 }] },
        { label: 'Second fail — deload', when: [{ metric: 'fail_streak', op: '>=', value: 2 }], then: [{ action: 'adjust_load_pct', value: -10 }, { action: 'reset_streaks' }] },
      ],
      otherwise: [{ action: 'hold' }],
    },
  },
  {
    name: 'Percentage block — auto-update max',
    description: 'Keep % loads current: raise the max when e1RM beats it, flag the coach on a big drop.',
    config: {
      clauses: [
        { label: 'Stronger', when: [{ metric: 'e1rm_vs_max_pct', op: '>=', value: 2 }], then: [{ action: 'max_from_e1rm' }] },
        { label: 'Well under max', when: [{ metric: 'e1rm_vs_max_pct', op: '<=', value: -8 }], then: [{ action: 'flag_coach', message: 'e1RM well below max — check fatigue / readiness' }] },
      ],
      otherwise: [{ action: 'hold' }],
    },
  },
  {
    name: 'Speed quality check',
    description: 'Flag sprints more than 5% slower than the target time.',
    config: {
      clauses: [
        { label: 'Slow', when: [{ metric: 'time_vs_target_pct', op: '>', value: 5 }], then: [{ action: 'flag_coach', message: 'Sprint times >5% off target' }] },
      ],
      otherwise: [{ action: 'hold' }],
    },
  },
];
