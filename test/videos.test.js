import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vids-'));
const db = openDb(':memory:');
const server = createApp(db, { uploadDir, push: null }).listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
const call = async (method, url, token, body) => {
  const res = await fetch(base + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const upload = async (token, fields, content = 'video') => {
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from(content)], { type: 'video/mp4' }), 'clip.mp4');
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const res = await fetch(`${base}/videos`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
  return (await res.json()).id;
};
const files = () => fs.readdirSync(uploadDir).length;

test('a new form check replaces the old one for that exercise; feedback, downloads and test videos', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const C = c.token;
  const a = (await call('POST', '/auth/register', null, { name: 'Sam Taylor', email: 's@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  const A = a.token;
  const ex = (await call('GET', '/exercises', C)).data.exercises;
  const squat = ex.find((e) => e.name === 'Back Squat');
  const bench = ex.find((e) => e.name === 'Bench Press');

  const v1 = await upload(A, { exercise_id: squat.id, note: 'first' }, 'squat one');
  await upload(A, { exercise_id: bench.id }, 'bench');
  await call('POST', '/comments', C, { athlete_id: a.user.id, target_type: 'video', target_id: v1, body: 'Knees out' });
  assert.equal(files(), 2);

  // A max-lift test video for squat is kept with its result.
  const t = await call('POST', `/athletes/${a.user.id}/tests`, A, { exercise_id: squat.id, weight: 180, reps: 1, tested_on: '2026-10-01' });
  assert.equal(t.status, 201);
  const testVid = await upload(A, { exercise_id: squat.id, test_id: t.data.id }, 'max');

  const v2 = await upload(A, { exercise_id: squat.id, note: 'second' }, 'squat two');
  const mine = (await call('GET', '/videos', A)).data.videos;
  const squats = mine.filter((v) => v.exercise_id === squat.id && v.id !== testVid);
  assert.deepEqual(squats.map((v) => v.id), [v2]); // only the latest squat form check
  assert.equal((await call('GET', `/videos/${v1}`, C)).status, 404);
  assert.ok(mine.some((v) => v.exercise_id === bench.id)); // other exercises untouched
  assert.ok(mine.some((v) => v.id === testVid)); // max-lift video kept
  assert.equal(files(), 3); // the old file is gone from disk

  // Earlier feedback moves to the new video; list shows the latest message.
  const listed = (await call('GET', '/videos', C)).data.videos.find((v) => v.id === v2);
  assert.equal(listed.comment_count, 1);
  assert.equal(listed.last_comment, 'Knees out');

  // Quick reply from the coach marks it reviewed.
  await call('POST', '/comments', C, { athlete_id: a.user.id, target_type: 'video', target_id: v2, body: 'Better depth 👍' });
  assert.equal((await call('GET', `/videos/${v2}`, C)).data.video.status, 'reviewed');

  // Download with a readable file name.
  const dl = await fetch(`${base}/videos/${v2}/file?token=${C}&download=1`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment; filename="Sam Taylor - Back Squat - \d{4}-\d{2}-\d{2}\.mp4"/);
  assert.equal(await dl.text(), 'squat two');
  const play = await fetch(`${base}/videos/${v2}/file?token=${C}`);
  assert.equal(play.headers.get('content-disposition'), null);
});

test('one-time tidy-up keeps only the latest existing video per athlete and exercise', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vids2-'));
  const d = openDb(':memory:');
  d.exec("INSERT INTO users (id, name, email, password_hash, role) VALUES (1, 'A', 'a@x.com', 'x', 'athlete')");
  d.exec("INSERT INTO exercises (id, coach_id, name) VALUES (50, 1, 'Squat'), (51, 1, 'Bench')");
  for (const [id, ex] of [[1, 50], [2, 50], [3, 50], [4, 51], [5, null], [6, null]]) {
    fs.writeFileSync(path.join(dir, `f${id}.mp4`), 'x');
    d.prepare('INSERT INTO videos (id, athlete_id, exercise_id, filename) VALUES (?, 1, ?, ?)').run(id, ex, `f${id}.mp4`);
  }
  d.exec("INSERT INTO comments (athlete_id, author_id, target_type, target_id, body) VALUES (1, 1, 'video', 1, 'old note')");
  d.exec("DELETE FROM app_settings WHERE key = 'videos_latest_only'");
  createApp(d, { uploadDir: dir, push: null });
  assert.deepEqual(d.prepare('SELECT id FROM videos ORDER BY id').all().map((r) => r.id), [3, 4, 5, 6]); // general videos untouched
  assert.equal(d.prepare('SELECT target_id FROM comments').get().target_id, 3);
  createApp(d, { uploadDir: dir, push: null }); // runs once only
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM videos').get().n, 4);
});
