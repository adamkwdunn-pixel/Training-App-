import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
const app = createApp(openDb(':memory:'), { uploadDir });
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());

async function call(method, url, token, body) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('coach builds a program, athlete trains, rules progress the load, feedback flows', async () => {
  // Coach signs up (first coach needs no key) and gets a starter library + preset rules.
  const c = await call('POST', '/auth/register', null, { name: 'Coach', email: 'coach@x.com', password: 'password1', role: 'coach' });
  assert.equal(c.status, 201);
  const coach = c.data.token;
  const code = c.data.user.invite_code;

  // A second coach can't sign up without the key.
  assert.equal((await call('POST', '/auth/register', null, { name: 'C2', email: 'c2@x.com', password: 'password1', role: 'coach' })).status, 403);

  const a = await call('POST', '/auth/register', null, { name: 'Prop', email: 'prop@x.com', password: 'password1', invite_code: code.toLowerCase() });
  assert.equal(a.status, 201);
  const athlete = a.data.token;
  const athleteId = a.data.user.id;

  const { exercises } = (await call('GET', '/exercises', coach)).data;
  const squat = exercises.find((e) => e.name === 'Back Squat');
  const sprint = exercises.find((e) => e.name === '30 m Sprint');
  const { rules } = (await call('GET', '/rules', coach)).data;
  const rir = rules.find((r) => r.name === 'RIR-guided progression');

  // Program: 2 weeks x 1 session.
  const p = (await call('POST', '/programs', coach, { name: 'Pre-season', weeks: 2, days_per_week: 1 })).data.program;
  assert.equal(p.days.length, 2);
  const day1 = p.days[0];
  const saved = await call('PUT', `/days/${day1.id}`, coach, {
    title: 'Lower + Speed',
    prescriptions: [
      { exercise_id: sprint.id, block: 'A', sets: 4, reps: '1', target: '30 m', target_value: 4.2, load_type: 'none', progression: 'none' },
      { exercise_id: squat.id, block: 'B', sets: 3, reps: '5', load_type: 'rir', rir: 2 },
    ],
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.program.days[0].prescriptions.length, 2);
  await call('POST', `/programs/${p.id}/copy-week`, coach, { from: 1, to: 2 });

  await call('POST', '/assignments', coach, { program_id: p.id, athlete_ids: [athleteId], rule_id: rir.id });
  await call('PUT', `/athletes/${athleteId}/state/${squat.id}`, coach, { max: 160 });

  // Athlete sees the next session with a computed load: 5 @ 2 RIR = 81.1% of 160 ≈ 130.
  const plan = (await call('GET', `/athletes/${athleteId}/plan`, athlete)).data;
  const next = plan.assignments[0].next_day;
  const sq = next.prescriptions.find((r) => r.exercise_id === squat.id);
  assert.equal(sq.target_load, 130);

  // Athlete logs an easy session -> rule adds 5 kg.
  const log = await call('POST', '/logs', athlete, {
    assignment_id: plan.assignments[0].id,
    day_id: next.id,
    sets: [
      ...[4.15, 4.2, 4.18, 4.25].map((t, i) => ({ prescription_id: next.prescriptions[0].id, set_number: i + 1, time_seconds: t })),
      ...[1, 2, 3].map((n) => ({ prescription_id: sq.id, set_number: n, target_load: 130, weight: 130, reps: 5, rir: 4 })),
    ],
  });
  assert.equal(log.status, 201);
  assert.equal(log.data.events.length, 1);
  assert.match(log.data.events[0].summary, /\+5 kg/);

  const plan2 = (await call('GET', `/athletes/${athleteId}/plan`, athlete)).data;
  assert.equal(plan2.assignments[0].completed, 1);
  const sq2 = plan2.assignments[0].next_day.prescriptions.find((r) => r.exercise_id === squat.id);
  assert.equal(sq2.target_load, 135);

  // Video upload + coach feedback.
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('fake video')], { type: 'video/mp4' }), 'squat.mp4');
  fd.append('exercise_id', String(squat.id));
  fd.append('workout_log_id', String(log.data.id));
  const vid = await call('POST', '/videos', athlete, fd);
  assert.equal(vid.status, 201);
  assert.equal((await call('GET', '/inbox', coach)).data.videos.length, 1);
  const file = await fetch(`${base}/videos/${vid.data.id}/file?token=${coach}`);
  assert.equal(await file.text(), 'fake video');

  await call('POST', '/comments', coach, { athlete_id: athleteId, target_type: 'video', target_id: vid.data.id, body: 'Knees out on the way up' });
  assert.equal((await call('GET', '/inbox', coach)).data.videos.length, 0);
  const fb = (await call('GET', '/inbox', athlete)).data.feedback;
  assert.equal(fb[0].body, 'Knees out on the way up');

  // Isolation: another squad's athlete can't see this one.
  const other = await call('POST', '/auth/register', null, { name: 'Other', email: 'o@x.com', password: 'password1', invite_code: code });
  assert.equal((await call('GET', `/athletes/${athleteId}/plan`, other.data.token)).status, 403);
  assert.equal((await call('GET', `/videos/${vid.data.id}/file`, other.data.token)).status, 403);
  assert.equal((await call('GET', '/programs', athlete)).status, 403);

  const hist = (await call('GET', `/athletes/${athleteId}/history?exercise_id=${squat.id}`, coach)).data;
  assert.equal(hist.points.length, 1);
  assert.equal(hist.points[0].top_weight, 130);
});
