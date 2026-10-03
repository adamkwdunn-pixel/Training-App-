import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { nextSetLoad, targetRirOf, repRange } from '../shared/effort.js';
import { computeMetrics, applyRule, PRESET_RULES } from '../server/lib/progression.js';

const rx = { reps: '6-10', rir: 2, load_type: 'rir' };
const next = (weight, reps, rir, r = rx, o) => nextSetLoad({ weight, reps, rir }, r, o);

test('one RIR harder than target takes ~2.5-3% off; on target holds', () => {
  assert.equal(next(100, 8, 1).load, 97.5);
  assert.equal(next(100, 8, 1).direction, 'down');
  assert.equal(next(100, 8, 2).direction, 'hold');
  assert.equal(next(100, 8, 1.5).direction, 'hold'); // within ±1 RIR: left alone
  assert.equal(next(100, 10, 2).load, 100);
  assert.equal(next(100, 8, 0).load, 95); // 2 RIR harder ≈ −5%
});

test('too easy goes up, cautiously; reps outside the range count', () => {
  assert.equal(next(100, 8, 3).load, 102.5);
  assert.equal(next(100, 8, 4).load, 107.5);
  assert.equal(next(100, 8, 5).load, 110); // capped at 10%
  assert.ok(next(100, 8, 5).load <= next(100, 8, 9).load && next(100, 8, 9).load <= 110);
  assert.equal(next(100, 12, 2).direction, 'up'); // past the top of the range
  assert.equal(next(100, 4, 1).load, 90); // short of the range, capped
  assert.equal(next(100, 8, 5, rx, { max_change_pct: 5 }).load, 105);
});

test('works with RPE targets and fixed reps, respects plates and missing data', () => {
  const rpe = { reps: '5', rpe: 8, load_type: 'rpe' };
  assert.equal(targetRirOf(rpe), 2);
  assert.equal(next(140, 5, 1, rpe).load, 135);
  assert.equal(next(20, 8, 1, rx, { increment: 2.5 }).load, 20); // one plate step on 20 kg is too big a jump
  assert.equal(next(100, 8, '', rx), null); // no RIR entered
  assert.equal(next(100, 8, 1, { reps: '5', load_type: 'percent', percent: 80 }), null); // no effort target
  assert.equal(next(100, 8, 1, rx, { enabled: false }), null);
  assert.deepEqual(repRange('6-10'), [6, 10]);
  assert.equal(repRange('AMRAP'), null);
});

test('long-term rules don’t add load on top of a session the app had to lighten', () => {
  const linear = PRESET_RULES.find((r) => r.name === 'Linear progression with deload').config;
  const r = { sets: 3, reps: '5', load_type: 'rir', rir: 2, metric: 'load' };
  const asPlanned = computeMetrics(r, [100, 100, 100].map((w) => ({ weight: w, reps: 5, rir: 2, target_load: 100 })), {});
  assert.equal(asPlanned.all_reps_completed, 1);
  assert.equal(applyRule(linear, asPlanned, { load_offset: 0 }).state.load_offset, 2.5);
  const lightened = computeMetrics(r, [100, 97.5, 97.5].map((w) => ({ weight: w, reps: 5, rir: 2, target_load: 100 })), {});
  assert.equal(lightened.all_reps_completed, 0);
  assert.equal(lightened.load_vs_target_pct, -1.7);
  assert.equal(applyRule(linear, lightened, { load_offset: 0 }).state.load_offset, 0);
  const heavier = computeMetrics(r, [100, 105, 105].map((w) => ({ weight: w, reps: 5, rir: 2, target_load: 100 })), {});
  assert.equal(heavier.all_reps_completed, 1);
});

test('coach settings reach the session, and adjustments are saved with the log', async () => {
  const server = createApp(openDb(':memory:'), { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null }).listen(0);
  test.after(() => server.close());
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (method, url, token, body) => {
    const res = await fetch(base + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const C = c.token;
  const a = (await call('POST', '/auth/register', null, { name: 'Sam', email: 's@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  assert.deepEqual((await call('GET', '/autoreg', C)).data.settings, { enabled: true, max_change_pct: 10 });
  assert.equal((await call('GET', '/autoreg', a.token)).status, 403);
  assert.deepEqual((await call('PUT', '/autoreg', C, { max_change_pct: 7.5 })).data.settings, { enabled: true, max_change_pct: 7.5 });

  const squat = (await call('GET', '/exercises', C)).data.exercises.find((e) => e.name === 'Back Squat');
  const p = (await call('POST', '/programs', C, { name: 'B', weeks: 1, days_per_week: 1 })).data.program;
  await call('PUT', `/days/${p.days[0].id}`, C, { title: 'Lower', prescriptions: [{ exercise_id: squat.id, sets: 3, reps: '6-10', load_type: 'fixed', fixed_load: 100, rir: 2 }] });
  const asg = (await call('POST', '/assignments', C, { program_id: p.id, athlete_ids: [a.user.id] }));
  assert.ok(asg.status < 300);
  const day = (await call('GET', `/athletes/${a.user.id}/days/${p.days[0].id}`, a.token)).data;
  assert.deepEqual(day.autoreg, { enabled: true, max_change_pct: 7.5, increment: 2.5 });

  const rx1 = day.day.prescriptions[0];
  const log = await call('POST', '/logs', a.token, {
    assignment_id: day.assignment_id, day_id: p.days[0].id,
    sets: [
      { prescription_id: rx1.id, set_number: 1, target_load: 100, weight: 100, reps: 8, rir: 1 },
      { prescription_id: rx1.id, set_number: 2, target_load: 100, weight: 97.5, reps: 8, rir: 2, suggested_load: 97.5, adjust_note: '1 RIR — harder than the 2 RIR target → −2.5 kg (−2.5%)' },
    ],
  });
  assert.equal(log.status, 201);
  const view = (await call('GET', `/logs/${log.data.id}`, C)).data;
  const s2 = (view.sets || view.log?.sets || []).find((s) => s.set_number === 2);
  assert.equal(s2.suggested_load, 97.5);
  assert.match(s2.adjust_note, /harder/);
});
