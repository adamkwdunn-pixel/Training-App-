import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const server = createApp(openDb(':memory:'), { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null }).listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
const call = async (method, url, token, body) => {
  const res = await fetch(base + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('an athlete can swap an accessory for their whole program; only their copy changes', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const C = c.token;
  const reg = async (name, email) => (await call('POST', '/auth/register', null, { name, email, password: 'password1', invite_code: c.user.invite_code })).data;
  const garin = await reg('Garin Roberts', 'g@x.com');
  const sam = await reg('Sam', 's@x.com');
  const outsider = await reg('Jo', 'j@x.com');
  const G = garin.token;

  const lib = (await call('GET', '/exercises', C)).data.exercises;
  const squat = lib.find((e) => e.name === 'Back Squat');
  const curl = (await call('POST', '/exercises', C, { name: 'Bicep Curl' })).data.exercise;
  const preacher = (await call('POST', '/exercises', G, { name: 'Preacher Curl' })).data.exercise;

  const p = (await call('POST', '/programs', C, { name: 'Block 1', weeks: 2, days_per_week: 2 })).data.program;
  for (const d of p.days) {
    await call('PUT', `/days/${d.id}`, C, { title: 'S', prescriptions: [
      { exercise_id: squat.id, sets: 3, reps: '5', load_type: 'rir', rir: 2 },
      ...(d.day === 1 ? [{ exercise_id: curl.id, sets: 3, reps: '10-12', load_type: 'rir', rir: 2, notes: 'Slow lowering' }] : []),
    ] });
  }
  await call('POST', '/assignments', C, { program_id: p.id, athlete_ids: [garin.user.id, sam.user.id] });
  const day1 = p.days.find((d) => d.week === 1 && d.day === 1);
  const day1w2 = p.days.find((d) => d.week === 2 && d.day === 1);
  const rxCurl = (await call('GET', `/athletes/${garin.user.id}/days/${day1.id}`, G)).data.day.prescriptions[1];
  const rxSquat = (await call('GET', `/athletes/${garin.user.id}/days/${day1.id}`, G)).data.day.prescriptions[0];

  // Guard rails.
  assert.equal((await call('POST', `/athletes/${garin.user.id}/swaps`, G, { prescription_id: rxSquat.id, exercise_id: preacher.id })).status, 400);
  assert.equal((await call('POST', `/athletes/${garin.user.id}/swaps`, G, { prescription_id: rxCurl.id, exercise_id: squat.id })).status, 400);
  assert.equal((await call('POST', `/athletes/${outsider.user.id}/swaps`, outsider.token, { prescription_id: rxCurl.id, exercise_id: preacher.id })).status, 403); // not their program
  assert.equal((await call('POST', `/athletes/${garin.user.id}/swaps`, sam.token, { prescription_id: rxCurl.id, exercise_id: preacher.id })).status, 403); // not their account

  const made = await call('POST', `/athletes/${garin.user.id}/swaps`, G, { prescription_id: rxCurl.id, exercise_id: preacher.id });
  assert.equal(made.status, 201);
  assert.equal(made.data.sessions, 2); // both day-1 sessions in the block
  assert.equal(made.data.swaps[0].from_name, 'Bicep Curl');
  assert.equal(made.data.swaps[0].to_name, 'Preacher Curl');

  // Every session in Garin's program now has Preacher Curl, keeping the coach's sets, reps and notes.
  for (const d of [day1, day1w2]) {
    const rx = (await call('GET', `/athletes/${garin.user.id}/days/${d.id}`, G)).data.day.prescriptions[1];
    assert.equal(rx.exercise_name, 'Preacher Curl');
    assert.equal(rx.swapped_from_name, 'Bicep Curl');
    assert.equal(rx.reps, '10-12');
    assert.equal(rx.notes, 'Slow lowering');
    assert.ok(rx.program_swap_id);
  }
  // Sam and the coach's program are untouched.
  assert.equal((await call('GET', `/athletes/${sam.user.id}/days/${day1.id}`, sam.token)).data.day.prescriptions[1].exercise_name, 'Bicep Curl');
  const prog = (await call('GET', `/programs/${p.id}`, C)).data.program;
  assert.equal(prog.days.find((d) => d.id === day1.id).prescriptions[1].exercise_id, curl.id);
  // Coach is told, and sees the swap on Garin's profile.
  const note = (await call('GET', '/notifications', C)).data.notifications.find((n) => /swapped Bicep Curl → Preacher Curl/.test(n.title));
  assert.ok(note);
  assert.equal((await call('GET', `/athletes/${garin.user.id}/swaps`, C)).data.swaps.length, 1);

  // Logging records the swap against the programmed exercise.
  const asgId = (await call('GET', `/athletes/${garin.user.id}/plan`, G)).data.assignments[0].id;
  const log = await call('POST', '/logs', G, { assignment_id: asgId, day_id: day1.id, sets: [
    { prescription_id: rxCurl.id, exercise_id: preacher.id, set_number: 1, weight: 20, reps: 12, rir: 2 },
  ] });
  assert.equal(log.status, 201);
  assert.deepEqual(log.data.swaps, ['Bicep Curl → Preacher Curl']);

  // The Program page lists the swappable accessories (not main lifts), with the swap in place.
  const acc = (await call('GET', `/athletes/${garin.user.id}/assignments/${asgId}/accessories`, G)).data.accessories;
  assert.deepEqual(acc.map((x) => [x.exercise_name, x.swapped_to, x.sessions]), [['Bicep Curl', 'Preacher Curl', 2]]);
  assert.equal((await call('GET', `/athletes/${garin.user.id}/assignments/${asgId}/accessories`, sam.token)).status, 403);

  // Switching back (athlete) or undoing (coach) restores the programmed exercise.
  const id = made.data.swaps[0].id;
  assert.equal((await call('DELETE', `/athletes/${garin.user.id}/swaps/${id}`, sam.token)).status, 403);
  assert.equal((await call('DELETE', `/athletes/${garin.user.id}/swaps/${id}`, C)).status, 200);
  assert.equal((await call('GET', `/athletes/${garin.user.id}/days/${day1w2.id}`, G)).data.day.prescriptions[1].exercise_name, 'Bicep Curl');
});
