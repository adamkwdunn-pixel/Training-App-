import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtSleep, splitSleep, joinSleep, sleepDebt } from '../shared/sleep.js';

test('hours and minutes formatting', () => {
  assert.equal(fmtSleep(7.5), '7 h 30 min');
  assert.equal(fmtSleep(8), '8 h');
  assert.equal(fmtSleep(0.75), '45 min');
  assert.equal(fmtSleep(joinSleep(6, 55)), '6 h 55 min');
  assert.equal(fmtSleep(null), '—');
  assert.deepEqual(splitSleep(7.5), { h: 7, m: 30 });
  assert.deepEqual(splitSleep(joinSleep(6, 55)), { h: 6, m: 55 });
  assert.equal(joinSleep('', ''), null);
});

test('sleep debt: shortfalls under 7 h 30 min over the last 14 days', () => {
  const nights = [
    { day: '2026-10-14', sleep_hours: 6.5 }, // 1 h short
    { day: '2026-10-13', sleep_hours: 8 }, // no debt, no payback
    { day: '2026-10-12', sleep_hours: joinSleep(7, 15) }, // 15 min short
    { day: '2026-10-01', sleep_hours: 5.5 }, // 2 h short, last day in the window
    { day: '2026-09-30', sleep_hours: 4 }, // 15 days ago: dropped off
    { day: '2026-10-10', sleep_hours: null }, // no sleep entered
  ];
  const d = sleepDebt(nights, '2026-10-14');
  assert.equal(d.debt_hours, 3.25);
  assert.equal(d.nights_logged, 4);
  assert.equal(d.nights_short, 3);
  assert.equal(d.level, 'moderate');
  assert.equal(sleepDebt([], '2026-10-14').debt_hours, 0);
  assert.equal(sleepDebt([{ day: '2026-10-14', sleep_hours: 2 }, { day: '2026-10-13', sleep_hours: 5 }], '2026-10-14').level, 'high');
});
