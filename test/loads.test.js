import test from 'node:test';
import assert from 'node:assert/strict';
import { pctForRepsRir, estimate1RM, targetLoad, roundTo, parseReps } from '../server/lib/loads.js';

test('RIR chart matches common reference points', () => {
  assert.equal(pctForRepsRir(1, 0), 100);
  assert.equal(pctForRepsRir(5, 0), 86.3);
  assert.equal(pctForRepsRir(5, 2), 81.1); // 7 effective reps
  assert.ok(Math.abs(pctForRepsRir(3, 1.5) - 87.8) < 1e-9);
});

test('e1RM inverts the chart', () => {
  assert.ok(Math.abs(estimate1RM(86.3, 5, 0) - 100) < 1e-9);
  assert.equal(estimate1RM(0, 5), null);
});

test('rounding and rep parsing', () => {
  assert.equal(roundTo(101.2, 2.5), 100);
  assert.equal(roundTo(101.3, 2.5), 102.5);
  assert.equal(parseReps('3-5'), 3);
  assert.equal(parseReps('AMRAP'), null);
});

test('target loads for each prescription type', () => {
  const state = { max: 150, load_offset: 0 };
  assert.equal(targetLoad({ load_type: 'percent', percent: 80 }, state).load, 120);
  assert.equal(targetLoad({ load_type: 'rir', reps: '5', rir: 2 }, state).load, 122.5); // 150 * 81.1%
  assert.equal(targetLoad({ load_type: 'rpe', reps: '5', rpe: 8 }, state).load, 122.5);
  assert.equal(targetLoad({ load_type: 'fixed', fixed_load: 60 }, { load_offset: 5 }).load, 65);
  assert.equal(targetLoad({ load_type: 'percent', percent: 80 }, {}).load, null);
  assert.equal(targetLoad({ load_type: 'percent', percent: 80 }, { max: 150, load_offset: 2.5 }).load, 122.5);
});
