// Turn a progression rule's clauses into plain-English sentences for the coach.

export const METRIC_LABELS = {
  all_reps_completed: 'all reps completed (1 = yes)',
  top_of_range: 'top of rep range on every set (1 = yes)',
  reps_missed: 'reps missed',
  sets_completed: 'sets completed',
  avg_rir: 'average RIR',
  min_rir: 'lowest RIR',
  last_set_rir: 'last-set RIR',
  rir_vs_target: 'RIR above target',
  top_set_weight: 'top set weight (kg)',
  load_vs_target_pct: 'weight vs prescribed (%)',
  e1rm: 'estimated 1RM (kg)',
  e1rm_vs_max_pct: 'e1RM vs max (%)',
  success_streak: 'successful sessions in a row',
  fail_streak: 'failed sessions in a row',
  best_time: 'best time (s)',
  time_vs_target_pct: 'time vs target (%)',
  best_result: 'best result',
  session_count: 'times logged',
};

const OP_WORDS = { '>=': 'is at least', '<=': 'is at most', '>': 'is more than', '<': 'is less than', '==': 'is', '!=': 'is not' };

export function conditionText(w) {
  const v = Number(w.value);
  const yes = (w.op === '==' && v === 1) || (w.op === '!=' && v === 0);
  const no = (w.op === '==' && v === 0) || (w.op === '!=' && v === 1);
  if (w.metric === 'all_reps_completed' && yes) return 'all the prescribed reps were completed';
  if (w.metric === 'all_reps_completed' && no) return 'any reps were missed';
  if (w.metric === 'top_of_range' && yes) return 'every set reached the top of the rep range';
  if (w.metric === 'top_of_range' && no) return 'not every set reached the top of the rep range';
  if (w.metric === 'rir_vs_target' && (w.op === '>=' || w.op === '>') && v >= 0) return `sets felt ${w.op === '>' ? 'more than ' : ''}${v === 0 ? 'on or easier than target' : `at least ${v} rep${v === 1 ? '' : 's'} easier than the target RIR`}`;
  if (w.metric === 'rir_vs_target' && (w.op === '<=' || w.op === '<') && v <= 0) return `sets felt ${v === 0 ? 'on or harder than target' : `at least ${-v} rep${v === -1 ? '' : 's'} harder than the target RIR`}`;
  if (w.metric === 'fail_streak' && w.op === '>=') return `it’s the ${ordinal(v)} failed session in a row`;
  if (w.metric === 'success_streak' && w.op === '>=') return `it’s the ${ordinal(v)} successful session in a row`;
  if (w.metric === 'reps_missed' && w.op === '>=') return `${v} or more reps were missed`;
  if (w.metric === 'e1rm_vs_max_pct') return `estimated 1RM is ${Math.abs(v)}% or more ${v >= 0 ? 'above' : 'below'} the current max`.replace(' or more', w.op.includes('=') ? ' or more' : '');
  if (w.metric === 'load_vs_target_pct' && (w.op === '<' || w.op === '<=') && v <= 0) return `the weight had to drop ${Math.abs(v)}% or more below what was prescribed`;
  if (w.metric === 'load_vs_target_pct' && (w.op === '>' || w.op === '>=') && v >= 0) return `they lifted ${v}% or more above the prescribed weight`;
  if (w.metric === 'time_vs_target_pct') return `best time is ${w.op.startsWith('>') ? 'more than' : 'within'} ${Math.abs(v)}% ${v >= 0 ? 'slower than' : 'faster than'} target`;
  return `${METRIC_LABELS[w.metric] || w.metric.replaceAll('_', ' ')} ${OP_WORDS[w.op] || w.op} ${v}`;
}

function ordinal(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

export function actionText(a) {
  const v = Number(a.value) || 0;
  const abs = Math.abs(v);
  switch (a.action) {
    case 'hold': return 'keep everything the same';
    case 'adjust_load_kg': return v >= 0 ? `add ${abs} kg to the working load` : `take ${abs} kg off the working load`;
    case 'adjust_load_pct': return `${v >= 0 ? 'increase' : 'reduce'} the working load by ${abs}%`;
    case 'adjust_max_kg': return `${v >= 0 ? 'raise' : 'lower'} their max by ${abs} kg`;
    case 'adjust_max_pct': return `${v >= 0 ? 'raise' : 'lower'} their max by ${abs}%`;
    case 'max_from_e1rm': return 'set their max to this session’s estimated 1RM (if higher)';
    case 'reset_load_adjustment': return 'reset the load back to what’s written';
    case 'reset_streaks': return 'reset the streak count';
    case 'flag_coach': return `flag it for you${a.message ? `: “${a.message}”` : ''}`;
    default: return a.action;
  }
}

const join = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** One sentence per clause, plus the fallback. */
export function ruleSentences(config) {
  const out = (config?.clauses || []).map((c, i) => ({
    label: c.label,
    text: `${i === 0 ? 'If' : 'Otherwise, if'} ${join((c.when || []).map(conditionText))}: ${join((c.then || []).map(actionText))}.`,
  }));
  const other = config?.otherwise?.length ? config.otherwise : [{ action: 'hold' }];
  out.push({ label: '', text: `${out.length ? 'Otherwise' : 'Always'}: ${join(other.map(actionText))}.` });
  return out.map((s) => ({ ...s, text: cap(s.text) }));
}
