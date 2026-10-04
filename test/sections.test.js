import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
const server = createApp(openDb(':memory:'), { uploadDir }).listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());

async function call(method, url, token, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(base + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('nutrition, recovery and testing sections', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Coach', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const a = (await call('POST', '/auth/register', null, { name: 'Wing', email: 'w@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  const C = c.token;
  const A = a.token;
  const id = a.user.id;

  // ---- Nutrition: profile -> equations + adjustable macros, bodyweight trend, body fat
  let n = (await call('GET', `/athletes/${id}/nutrition`, A)).data;
  assert.ok(n.targets.missing.length);
  const prof = await call('PUT', `/athletes/${id}/nutrition/profile`, A, {
    sex: 'male', birth_date: '2000-01-01', height_cm: 185, weight: 100, activity: 1.55, goal: 'lose', rate: 0.5,
    protein_g_per_kg: 2.2, fat_g_per_kg: 0.8, kcal_override: 1000,
  });
  assert.equal(prof.status, 200);
  assert.equal(prof.data.targets.adjust, -550);
  assert.equal(prof.data.targets.protein, 220);
  assert.equal(prof.data.targets.overridden, false); // athletes can't pin calories
  assert.equal((await call('PUT', `/athletes/${id}/nutrition/profile`, A, { macro_mode: 'percent', protein_pct: 60, fat_pct: 40 })).status, 400);
  const pinned = await call('PUT', `/athletes/${id}/nutrition/profile`, C, { kcal_override: 3200 });
  assert.equal(pinned.data.targets.kcal, 3200);

  for (const [d, w] of [['2026-09-01', 101], ['2026-09-08', 100.5], ['2026-09-15', 100]]) {
    await call('POST', `/athletes/${id}/bodyweight`, A, { measured_on: d, weight: w });
  }
  n = (await call('GET', `/athletes/${id}/nutrition`, A)).data;
  assert.equal(n.weights.length, 4); // + today's from the profile
  assert.ok(n.weights.every((w) => w.trend != null));

  const navy = await call('POST', `/athletes/${id}/bodycomp`, A, { method: 'navy', neck: 42, waist: 88, measured_on: '2026-09-15' });
  assert.equal(navy.status, 201);
  assert.ok(navy.data.body_fat_pct > 10 && navy.data.body_fat_pct < 20);
  const jp = await call('POST', `/athletes/${id}/bodycomp`, C, { method: 'jp7', sites: { chest: 8, midaxillary: 10, triceps: 9, subscapular: 12, abdominal: 18, suprailiac: 12, thigh: 11 } });
  assert.equal(jp.data.sum_mm, 80);
  assert.equal((await call('POST', `/athletes/${id}/bodycomp`, A, { method: 'jp3', sites: { chest: 8 } })).status, 400);
  const bc = (await call('GET', `/athletes/${id}/bodycomp`, A)).data;
  assert.equal(bc.measurements.length, 2);
  assert.ok(bc.measurements[1].lean_mass > 80);

  // Katch-McArdle now has lean mass to work with.
  const katch = await call('PUT', `/athletes/${id}/nutrition/profile`, A, { bmr_equation: 'katch' });
  assert.equal(katch.data.targets.equation, 'katch');

  const squadN = (await call('GET', '/nutrition/squad', C)).data.athletes[0];
  assert.equal(squadN.goal, 'lose');
  assert.equal(squadN.body_fat_pct, jp.data.body_fat_pct);

  // ---- Recovery: readiness, injuries (+ thread), protocols
  const r = await call('POST', `/athletes/${id}/readiness`, A, { sleep_hours: 8, sleep_quality: 2, energy: 2, soreness: 4, stress: 3, mood: 3 });
  assert.equal(r.data.score, 35);
  assert.equal((await call('GET', '/inbox', C)).data.low_readiness.length, 1);
  assert.equal((await call('POST', `/athletes/${id}/readiness`, A, { sleep_quality: 2 })).status, 400);
  // Hours + minutes, and the 14-day sleep debt meter.
  const yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await call('POST', `/athletes/${id}/readiness`, A, { day: yday, sleep_h: 6, sleep_m: 45, sleep_quality: 3, energy: 3, soreness: 3, stress: 3, mood: 3 });
  const rd = (await call('GET', `/athletes/${id}/readiness?today=${yday}`, A)).data;
  assert.equal(rd.today.sleep_hours, 6.75);
  assert.equal(rd.sleep_debt.debt_hours, 0.75);
  assert.equal((await call('POST', `/athletes/${id}/readiness`, A, { sleep_h: 20, sleep_quality: 3, energy: 3, soreness: 3, stress: 3, mood: 3 })).status, 400);

  const inj = await call('POST', `/athletes/${id}/injuries`, A, { area: 'Hamstring', side: 'left', pain: 4, availability: 'modified', description: 'Tight after sprints' });
  assert.equal(inj.status, 201);
  assert.equal((await call('GET', '/inbox', C)).data.injuries.length, 1);
  await call('PATCH', `/injuries/${inj.data.id}`, A, { status: 'rehab' }); // athletes can't move to rehab
  assert.equal((await call('GET', `/injuries/${inj.data.id}`, A)).data.injury.status, 'new');
  await call('PATCH', `/injuries/${inj.data.id}`, C, { status: 'rehab' });
  assert.equal((await call('GET', `/injuries/${inj.data.id}`, A)).data.injury.status, 'rehab');
  assert.equal((await call('POST', '/comments', C, { athlete_id: id, target_type: 'injury', target_id: inj.data.id, body: 'Start the hamstring protocol' })).status, 201);

  const { protocols } = (await call('GET', '/protocols', C)).data;
  assert.ok(protocols.length >= 5);
  const ham = protocols.find((p) => p.name === 'Hamstring prehab');
  await call('POST', `/protocols/${ham.id}/assign`, C, { athlete_ids: [id], frequency: '2× per week' });
  let mine = (await call('GET', `/athletes/${id}/protocols`, A)).data.protocols;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].items.length, 3);
  await call('POST', `/protocol-assignments/${mine[0].id}/complete`, A, {});
  mine = (await call('GET', `/athletes/${id}/protocols`, A)).data.protocols;
  assert.equal(mine[0].done_today, 1);
  assert.equal((await call('GET', '/protocols', A)).status, 403);

  const squadR = (await call('GET', '/recovery/squad', C)).data.athletes[0];
  assert.equal(squadR.latest.score, 35);
  assert.equal(squadR.injuries.length, 1);

  // ---- Testing: main lifts, rep max -> e1RM -> program max, video of the lift
  const t = (await call('GET', `/athletes/${id}/tests`, A)).data;
  assert.deepEqual(t.lifts.map((l) => l.exercise.name), ['Back Squat', 'Bench Press', 'Deadlift', 'Power Clean', 'Overhead Press', 'Weighted Chin-up']);
  const squat = t.lifts[0].exercise;
  const res3 = await call('POST', `/athletes/${id}/tests`, A, { exercise_id: squat.id, weight: 180, reps: 3 });
  assert.equal(res3.status, 201);
  assert.equal(res3.data.e1rm, Math.round((180 / 0.922) * 10) / 10);

  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('max lift')], { type: 'video/mp4' }), 'squat.mp4');
  fd.append('exercise_id', String(squat.id));
  fd.append('test_id', String(res3.data.id));
  assert.equal((await call('POST', '/videos', A, fd)).status, 201);

  const t2 = (await call('GET', `/athletes/${id}/tests`, A)).data.lifts[0];
  assert.equal(t2.latest.weight, 180);
  assert.ok(t2.last_video.video_id);
  assert.equal(t2.max, res3.data.e1rm);
  assert.equal(t2.latest.verified, 0);

  const board = (await call('GET', '/testing/squad', C)).data;
  assert.equal(board.athletes[0].results[squat.id].weight, 180);
  await call('PATCH', `/tests/${res3.data.id}`, C, { verified: true });
  assert.equal((await call('GET', `/athletes/${id}/tests`, A)).data.lifts[0].latest.verified, 1);
});
