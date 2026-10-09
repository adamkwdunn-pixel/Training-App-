import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, isMainLiftName } from '../server/db.js';
import { createApp } from '../server/app.js';
import { runPhotoReminders, PHOTO_REMINDER } from '../server/notify.js';

const db = openDb(':memory:');
const app = createApp(db, { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null });
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
let invite;
const call = async (method, url, token, body) => {
  const res = await fetch(base + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('main movements are recognised by name', () => {
  for (const n of ['Back Squat', 'Front Squat', 'Deadlift', 'Trap Bar Deadlift', 'Bench Press', 'Power Clean', 'Overhead Press', 'Chin-up']) assert.ok(isMainLiftName(n), n);
  for (const n of ['Bicep Curl', 'Preacher Curl', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Goblet Squat', 'Nordic Curl', 'Lat Pulldown']) assert.ok(!isMainLiftName(n), n);
});

test('athletes can swap accessories (from the library or their own new exercise) but not main movements', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  invite = c.user.invite_code;
  const C = c.token;
  const a = (await call('POST', '/auth/register', null, { name: 'Sam', email: 's@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  const A = a.token;
  const lib = (await call('GET', '/exercises', C)).data.exercises;
  const squat = lib.find((e) => e.name === 'Back Squat');
  assert.equal(squat.main, true);
  const curl = (await call('POST', '/exercises', C, { name: 'Bicep Curl', category: 'strength', metric: 'load' })).data.exercise;
  assert.equal(curl.main, false);

  const p = (await call('POST', '/programs', C, { name: 'B', weeks: 1, days_per_week: 1 })).data.program;
  await call('PUT', `/days/${p.days[0].id}`, C, { title: 'Upper', prescriptions: [
    { exercise_id: squat.id, sets: 3, reps: '5', load_type: 'rir', rir: 2 },
    { exercise_id: curl.id, sets: 3, reps: '10-12', load_type: 'rir', rir: 2 },
  ] });
  await call('POST', '/assignments', C, { program_id: p.id, athlete_ids: [a.user.id] });
  const day = (await call('GET', `/athletes/${a.user.id}/days/${p.days[0].id}`, A)).data.day;
  const [rxSquat, rxCurl] = day.prescriptions;
  assert.equal(rxSquat.swappable, false);
  assert.equal(rxCurl.swappable, true);

  // Athlete adds their own exercise the same way the coach does; it's never a main movement and isn't duplicated.
  const mine = await call('POST', '/exercises', A, { name: 'Preacher Curl', category: 'strength', metric: 'load', cues: 'Elbows on the pad' });
  assert.equal(mine.status, 201);
  assert.equal(mine.data.exercise.main, false);
  assert.equal((await call('POST', '/exercises', A, { name: ' preacher curl ' })).data.exercise.id, mine.data.exercise.id);
  assert.equal((await call('GET', '/exercises', C)).data.exercises.find((e) => e.name === 'Preacher Curl').created_by_name, 'Sam');
  assert.equal((await call('PUT', `/exercises/${curl.id}`, A, { name: 'x' })).status, 403); // editing stays coach-only

  // Swap preview: same sets/reps/effort, new exercise.
  const sw = await call('GET', `/athletes/${a.user.id}/rx/${rxCurl.id}/swap?exercise_id=${mine.data.exercise.id}`, A);
  assert.equal(sw.status, 200);
  assert.equal(sw.data.prescription.exercise_name, 'Preacher Curl');
  assert.equal(sw.data.prescription.reps, '10-12');
  assert.equal(sw.data.prescription.swapped_from_name, 'Bicep Curl');
  assert.equal((await call('GET', `/athletes/${a.user.id}/rx/${rxSquat.id}/swap?exercise_id=${mine.data.exercise.id}`, A)).status, 400);
  assert.equal((await call('GET', `/athletes/${a.user.id}/rx/${rxCurl.id}/swap?exercise_id=${squat.id}`, A)).status, 400);

  // Log with the swap.
  const asgId = (await call('GET', `/athletes/${a.user.id}/plan`, A)).data.assignments[0].id;
  const log = await call('POST', '/logs', A, { assignment_id: asgId, day_id: p.days[0].id, sets: [
    { prescription_id: rxSquat.id, exercise_id: squat.id, set_number: 1, weight: 100, reps: 5, rir: 2 },
    { prescription_id: rxCurl.id, exercise_id: mine.data.exercise.id, set_number: 1, weight: 20, reps: 12, rir: 2 },
  ] });
  assert.equal(log.status, 201, JSON.stringify(log.data));
  assert.deepEqual(log.data.swaps, ['Bicep Curl → Preacher Curl']);
  const view = (await call('GET', `/logs/${log.data.id}`, C)).data;
  const curlSet = (view.sets || []).find((s) => s.prescription_id === rxCurl.id);
  assert.equal(curlSet.exercise_name, 'Preacher Curl');
  assert.equal(curlSet.swapped_from_name, 'Bicep Curl');
  const coachNote = (await call('GET', '/notifications', C)).data.notifications.find((n) => n.type === 'session');
  assert.match(coachNote.body, /swapped Bicep Curl → Preacher Curl/);

  // Main movements can't be swapped through the log either.
  const bad = await call('POST', '/logs', A, { assignment_id: asgId, day_id: p.days[0].id, sets: [
    { prescription_id: rxSquat.id, exercise_id: mine.data.exercise.id, set_number: 1, weight: 20, reps: 5 },
  ] });
  assert.equal(bad.status, 400, JSON.stringify(bad));

  // The coach can mark any exercise as main (or not).
  await call('PUT', `/exercises/${curl.id}`, C, { ...curl, main_lift: 1 });
  const day2 = (await call('GET', `/athletes/${a.user.id}/days/${p.days[0].id}`, A)).data.day;
  assert.equal(day2.prescriptions[1].swappable, false);
});

test('weekly progress-photo reminder on the athlete’s chosen day', async () => {
  const a = (await call('POST', '/auth/register', null, { name: 'Jo', email: 'j@x.com', password: 'password1', invite_code: invite })).data;
  const prefs = (await call('GET', '/notifications/prefs', a.token)).data;
  assert.equal(prefs.prefs.photo_day, 1);
  assert.ok('photo' in prefs.types);
  await call('PUT', '/notifications/prefs', a.token, { ...prefs.prefs, timezone: 'Europe/London', reminder_time: '08:00', photo_day: 3 });
  const n = app.locals.notify;
  const count = () => db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'photo'").get(a.user.id).n;
  runPhotoReminders(db, n, new Date('2026-10-13T09:00:00Z')); // Tuesday
  assert.equal(count(), 0);
  runPhotoReminders(db, n, new Date('2026-10-14T06:30:00Z')); // Wednesday 07:30 London — before reminder time
  assert.equal(count(), 0);
  runPhotoReminders(db, n, new Date('2026-10-14T07:30:00Z')); // Wednesday 08:30 London
  runPhotoReminders(db, n, new Date('2026-10-14T12:00:00Z')); // only once that day
  assert.equal(count(), 1);
  const note = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'photo'").get(a.user.id);
  assert.equal(note.title, PHOTO_REMINDER.title);
  assert.match(note.body, /keep a record of these pictures to show your own visual progress over time/i);
  runPhotoReminders(db, n, new Date('2026-10-21T07:30:00Z')); // next week
  assert.equal(count(), 2);
  await call('PUT', '/notifications/prefs', a.token, { muted: ['photo'] });
  runPhotoReminders(db, n, new Date('2026-10-28T07:30:00Z'));
  assert.equal(count(), 2);
});

test('speed and power work stays as programmed by default', async () => {
  const { isMainLift } = await import('../server/db.js');
  assert.equal(isMainLift({ name: '10 m Acceleration', category: 'speed', main_lift: null }), true);
  assert.equal(isMainLift({ name: 'Box Jump', category: 'power', main_lift: null }), true);
  assert.equal(isMainLift({ name: 'Box Jump', category: 'power', main_lift: 0 }), false); // coach unlocked it
  assert.equal(isMainLift({ name: 'Face Pull', category: 'strength', main_lift: null }), false);
});
