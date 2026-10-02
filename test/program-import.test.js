import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { ImportError } from '../server/lib/program-import.js';

const seen = [];
// Stand-in for Claude: returns what the real importer would after parsing the structured output.
const programImporter = async (files, library) => {
  seen.push({ files: files.map((f) => [f.originalname, f.mimetype]), library });
  if (files[0].originalname === 'cat.png') throw new ImportError(422, 'That doesn’t look like a training program.');
  const ex = (o) => ({ library_match: '', category: 'strength', metric: 'load', block: '', sets: 3, reps: '5', load_type: 'none', percent: null, rir: null, rpe: null, fixed_load: null, target: '', rest_seconds: null, tempo: '', notes: '', ...o });
  return {
    is_program: true, name: 'Pre-season block', description: '2 sessions a week', warnings: ['Week 4 rest times were unreadable'],
    weeks: [
      { repeat: 3, days: [
        { title: 'Lower', notes: 'RAMP warm-up', exercises: [
          ex({ name: 'Back squat', library_match: libraryName(library, /squat/i), block: 'A1', sets: 4, reps: '5', load_type: 'Percent', percent: 80, rir: 2, rest_seconds: 180 }),
          ex({ name: 'Nordic curl', block: 'B1', reps: '6', load_type: 'bodyweight' }),
        ] },
        { title: 'Speed', notes: '', exercises: [ex({ name: 'Flying 20s', category: 'Speed', metric: 'time', sets: 4, reps: '1', target: '20 m' })] },
      ] },
      { repeat: 1, days: [{ title: 'Deload', notes: '', exercises: [ex({ name: 'back squat', sets: 2, reps: '5', load_type: 'rir', rir: 4 })] }] },
    ],
  };
};
const libraryName = (lib, re) => lib.find((n) => re.test(n)) || '';

const server = createApp(openDb(':memory:'), { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null, programImporter }).listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
const call = async (method, url, token, body) => {
  const res = await fetch(base + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const upload = async (token, files) => {
  const fd = new FormData();
  for (const [name, type] of files) fd.append('files', new Blob([Buffer.from('%PDF-1.4 fake')], { type }), name);
  const res = await fetch(`${base}/programs/import`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: fd });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('import a program from a PDF: preview draft, then create it', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const C = c.token;
  const a = (await call('POST', '/auth/register', null, { name: 'Sam', email: 's@x.com', password: 'password1', invite_code: c.user.invite_code })).data;

  assert.equal((await call('GET', '/me', C)).data.system.import_configured, true);
  assert.equal((await upload(a.token, [['p.pdf', 'application/pdf']])).status, 403);
  assert.equal((await upload(C, [['notes.txt', 'text/plain']])).status, 400); // unsupported types are dropped
  assert.equal((await upload(C, [['cat.png', 'image/png']])).status, 422);

  const r = await upload(C, [['block.pdf', 'application/pdf'], ['page2.jpg', 'image/jpeg']]);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(seen.at(-1).files, [['block.pdf', 'application/pdf'], ['page2.jpg', 'image/jpeg']]);
  const d = r.data.draft;
  assert.equal(d.weeks.length, 4); // 3 repeated + deload
  assert.deepEqual(d.weeks.map((w) => w.week), [1, 2, 3, 4]);
  assert.equal(d.weeks[2].days[0].title, 'Lower');
  const squat = d.weeks[0].days[0].exercises[0];
  const lib = (await call('GET', '/exercises', C)).data.exercises;
  const libSquat = lib.find((e) => e.name === squat.name);
  assert.ok(libSquat, 'matched to the library');
  assert.equal(squat.new, false);
  assert.equal(squat.load_type, 'percent');
  assert.equal(d.weeks[3].days[0].exercises[0].exercise_id, libSquat.id); // case-insensitive name match
  assert.equal(d.weeks[0].days[1].exercises[0].category, 'speed');
  assert.ok(d.new_exercises.includes('Flying 20s'));
  assert.deepEqual(d.warnings, ['Week 4 rest times were unreadable']);

  d.name = 'Pre-season 2026';
  const made = await call('POST', '/programs/import/create', C, { draft: d });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const p = made.data.program;
  assert.equal(p.name, 'Pre-season 2026');
  assert.equal(p.weeks, 4);
  const after = (await call('GET', '/exercises', C)).data.exercises;
  assert.equal(after.length, lib.length + 2); // Nordic curl + Flying 20s added once each
  assert.equal(after.find((e) => e.name === 'Flying 20s').metric, 'time');

  assert.equal((await call('POST', '/programs/import/create', a.token, { draft: d })).status, 403);
});

test('import says clearly when the AI key is missing', async () => {
  const s2 = createApp(openDb(':memory:'), { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null, programImporter: null }).listen(0);
  test.after(() => s2.close());
  const b2 = `http://localhost:${s2.address().port}/api`;
  const c = await (await fetch(`${b2}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A', email: 'a@x.com', password: 'password1', role: 'coach' }) })).json();
  const fd = new FormData();
  fd.append('files', new Blob(['x'], { type: 'application/pdf' }), 'p.pdf');
  const res = await fetch(`${b2}/programs/import`, { method: 'POST', headers: { authorization: `Bearer ${c.token}` }, body: fd });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ANTHROPIC_API_KEY/);
});
