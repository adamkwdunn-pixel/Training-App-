import test from 'node:test';
import assert from 'node:assert/strict';
import { linksFrom, relabel, groupsOf, isAutoLabelled } from '../client/src/supersets.js';

const L = (...b) => b.map((block) => ({ block }));
const labels = (list) => list.map((r) => r.block);

test('linking exercises makes supersets of any size, lettered in order', () => {
  assert.deepEqual(labels(relabel(L('', '', '', '', ''), [false, true, true, false])), ['A', 'B1', 'B2', 'B3', 'C']);
  assert.deepEqual(labels(relabel(L('', '', ''), [true, true])), ['A1', 'A2', 'A3']);
  assert.deepEqual(labels(relabel(L('', ''), [false])), ['A', 'B']);
});

test('supersets are read back from labels, including imported A1/A2 programs', () => {
  const day = L('A', 'B1', 'B2', 'C1', 'C2', 'C3', 'D');
  assert.deepEqual(linksFrom(day), [false, true, false, true, true, false]);
  assert.deepEqual(groupsOf(day), [[0], [1, 2], [3, 4, 5], [6]]);
  assert.deepEqual(groupsOf(L('A1', 'A2')), [[0, 1]]);
  assert.deepEqual(groupsOf(L('Speed', 'Speed')), [[0], [1]]); // custom labels aren't supersets
});

test('moving an exercise out of a superset re-letters cleanly', () => {
  assert.deepEqual(labels(relabel(L('A1', 'B', 'A2'))), ['A', 'B', 'C']);
  assert.deepEqual(labels(relabel(L('A2', 'A1', 'B'))), ['A1', 'A2', 'B']);
  assert.equal(isAutoLabelled(L('A1', '', 'C')), true);
  assert.equal(isAutoLabelled(L('A1', 'Warm-up')), false);
});
