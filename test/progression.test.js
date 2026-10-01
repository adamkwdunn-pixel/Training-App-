import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, applyRule, PRESET_RULES } from '../server/lib/progression.js';

const rx = { sets: 3, reps: '5', rir: 2, load_type: 'rir', metric: 'load' };
const rule = (name) => PRESET_RULES.find((r) => r.name === name).config;

test('metrics from logged sets', () => {
  const m = computeMetrics(rx, [
    { weight: 100, reps: 5, rir: 3 }, { weight: 100, reps: 5, rir: 3 }, { weight: 100, reps: 4, rir: 0 },
  ], { max: 120, success_streak: 2 });
  assert.equal(m.all_reps_completed, 0);
  assert.equal(m.reps_missed, 1);
  assert.equal(m.min_rir, 0);
  assert.equal(m.success_streak, 0);
  assert.equal(m.fail_streak, 1);
  assert.ok(m.e1rm > 120);
});

test('RIR double progression adds 5 kg when sets feel easy', () => {
  const sets = Array(3).fill({ weight: 100, reps: 5, rir: 4 });
  const m = computeMetrics(rx, sets, {});
  const out = applyRule(rule('RIR-guided progression'), m, { max: 130, load_offset: 0 });
  assert.equal(out.matched, 'Too easy');
  assert.equal(out.state.load_offset, 5);
});

test('missed reps cuts load by a percentage of the prescribed load', () => {
  const sets = [{ weight: 100, reps: 3, rir: 0 }, { weight: 100, reps: 3, rir: 0 }, { weight: 100, reps: 3, rir: 0 }];
  const m = computeMetrics(rx, sets, {});
  const out = applyRule(rule('RIR-guided progression'), m, { max: 130, load_offset: 0 }, { lastLoad: 100 });
  assert.equal(out.matched, 'Missed reps');
  assert.equal(out.state.load_offset, -5);
});

test('linear rule deloads after a second failure', () => {
  const sets = [{ weight: 100, reps: 2 }];
  const m = computeMetrics({ sets: 3, reps: '5', load_type: 'fixed' }, sets, { fail_streak: 1 });
  const out = applyRule(rule('Linear progression with deload'), m, { load_offset: 10, fail_streak: 1 }, { lastLoad: 100 });
  assert.equal(out.state.load_offset, 0);
  assert.equal(out.state.fail_streak, 0);
});

test('max auto-updates from e1RM and flags drops', () => {
  const up = applyRule(rule('Percentage block — auto-update max'), computeMetrics(rx, [{ weight: 120, reps: 5, rir: 0 }], { max: 130 }), { max: 130 });
  assert.ok(up.state.max > 130);
  const down = applyRule(rule('Percentage block — auto-update max'), computeMetrics(rx, [{ weight: 80, reps: 5, rir: 0 }], { max: 130 }), { max: 130 });
  assert.equal(down.flags.length, 1);
  assert.equal(down.state.max, 130);
});

test('speed rule flags slow sprints and ignores reps', () => {
  const sprint = { sets: 4, reps: '1', target_value: 4.0, metric: 'time' };
  const m = computeMetrics(sprint, [4.3, 4.4, 4.35, 4.5].map((t) => ({ time_seconds: t })), {});
  assert.equal(m.all_reps_completed, 1);
  const out = applyRule(rule('Speed quality check'), m, {});
  assert.deepEqual(out.flags, ['Sprint times >5% off target']);
});

test('missing data never matches a condition', () => {
  const out = applyRule({ clauses: [{ when: [{ metric: 'avg_rir', op: '<=', value: 5 }], then: [{ action: 'adjust_load_kg', value: 10 }] }] }, { avg_rir: null }, { load_offset: 0 });
  assert.equal(out.matched, 'otherwise');
  assert.equal(out.state.load_offset, 0);
});
