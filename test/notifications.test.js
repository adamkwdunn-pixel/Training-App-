import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { localNow, runReminders } from '../server/notify.js';

const db = openDb(':memory:');
const pushed = [];
const gone = new Set();
const app = createApp(db, {
  uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-')),
  version: 'build-123',
  push: async (sub, payload) => {
    pushed.push({ endpoint: sub.endpoint, ...payload });
    return gone.has(sub.endpoint) ? 'gone' : 'sent';
  },
});
const server = app.listen(0);
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
const titles = async (token) => (await call('GET', '/notifications', token)).data.notifications.map((n) => n.title);
const tick = () => new Promise((r) => setTimeout(r, 20));

test('coach and athlete notifications, push, mutes and reminders', async () => {
  assert.equal((await call('GET', '/version')).data.version, 'build-123');

  const c = (await call('POST', '/auth/register', null, { name: 'Adam Coach', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const a = (await call('POST', '/auth/register', null, { name: 'Sam Taylor', email: 's@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  const C = c.token;
  const A = a.token;
  const id = a.user.id;
  assert.deepEqual(await titles(C), ['Sam Taylor joined your squad']);

  // Phones subscribe for push.
  const sub = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'k', auth: 'a' } });
  assert.equal((await call('POST', '/push/subscribe', C, { subscription: sub('coach') })).status, 201);
  assert.equal((await call('POST', '/push/subscribe', A, { subscription: sub('athlete') })).status, 201);
  assert.equal((await call('POST', '/push/subscribe', A, { subscription: { endpoint: 'http://insecure' } })).status, 400);

  // Program assignment -> athlete.
  const { exercises } = (await call('GET', '/exercises', C)).data;
  const squat = exercises.find((e) => e.name === 'Back Squat');
  const p = (await call('POST', '/programs', C, { name: 'Block 1', weeks: 1, days_per_week: 1 })).data.program;
  await call('PUT', `/days/${p.days[0].id}`, C, { title: 'Lower', prescriptions: [{ exercise_id: squat.id, sets: 1, reps: '5', load_type: 'fixed', fixed_load: 100 }] });
  await call('POST', '/assignments', C, { program_id: p.id, athlete_ids: [id] });
  assert.equal((await titles(A))[0], 'New program: Block 1');

  // Athlete completes a session -> coach is told, athlete gets a summary.
  const plan = (await call('GET', `/athletes/${id}/plan`, A)).data.assignments[0];
  const rx = plan.next_day.prescriptions[0];
  const log = await call('POST', '/logs', A, { assignment_id: plan.id, day_id: plan.next_day.id, session_rpe: 8, sets: [{ prescription_id: rx.id, weight: 100, reps: 5 }] });
  assert.equal(log.status, 201);
  assert.equal((await titles(C))[0], 'Sam Taylor completed Lower');
  assert.equal((await titles(A))[0], 'Session complete 💪');
  await tick();
  assert.ok(pushed.some((x) => x.endpoint.endsWith('/coach') && x.title === 'Sam Taylor completed Lower' && x.url === `/logs/${log.data.id}`));
  assert.ok(pushed.some((x) => x.endpoint.endsWith('/athlete') && x.title === 'Session complete 💪'));

  // Form check -> coach; coach comment -> athlete; athlete reply -> coach.
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('v')], { type: 'video/mp4' }), 'squat.mp4');
  fd.append('exercise_id', String(squat.id));
  fd.append('note', 'Depth ok?');
  const vid = (await call('POST', '/videos', A, fd)).data.id;
  assert.equal((await titles(C))[0], 'Sam Taylor sent a form check');
  await call('POST', '/comments', C, { athlete_id: id, target_type: 'video', target_id: vid, body: 'Good depth, knees out' });
  const an = (await call('GET', '/notifications', A)).data.notifications[0];
  assert.equal(an.title, 'Adam commented on your form check');
  assert.equal(an.body, 'Good depth, knees out');
  assert.equal(an.link, `/videos/${vid}`);
  await call('POST', '/comments', A, { target_type: 'video', target_id: vid, body: 'Thanks!' });
  assert.equal((await titles(C))[0], 'Sam Taylor replied on their form check');

  // Check-in, injury, data, test -> coach.
  await call('POST', `/athletes/${id}/readiness`, A, { sleep_hours: 5, sleep_quality: 2, energy: 2, soreness: 2, stress: 2, mood: 2 });
  assert.match((await titles(C))[0], /^⚠️ Sam Taylor checked in: \d+\/100$/);
  await call('POST', `/athletes/${id}/readiness`, A, { sleep_hours: 6, sleep_quality: 3, energy: 3, soreness: 3, stress: 3, mood: 3 });
  assert.equal((await titles(C)).filter((t) => t.includes('checked in')).length, 1); // edits don't re-notify
  const inj = (await call('POST', `/athletes/${id}/injuries`, A, { area: 'Hamstring', side: 'left', pain: 4 })).data.id;
  assert.equal((await titles(C))[0], '🚑 Sam Taylor reported an injury');
  await call('PATCH', `/injuries/${inj}`, C, { status: 'rehab' });
  assert.equal((await titles(A))[0], 'Adam updated your injury');
  await call('POST', `/athletes/${id}/bodyweight`, A, { weight: 101 });
  assert.equal((await titles(C))[0], 'Sam Taylor logged bodyweight');
  const t = (await call('POST', `/athletes/${id}/tests`, A, { exercise_id: squat.id, weight: 150, reps: 3 })).data.id;
  assert.equal((await titles(C))[0], 'Sam Taylor logged a test');
  await call('PATCH', `/tests/${t}`, C, { verified: true });
  assert.equal((await titles(A))[0], 'Adam verified your Back Squat ✓');

  // Unread count and mark as read.
  assert.ok((await call('GET', '/notifications/unread', C)).data.count > 5);
  await call('POST', '/notifications/read', C, {});
  assert.equal((await call('GET', '/notifications/unread', C)).data.count, 0);

  // Mutes: coach turns off bodyweight entries.
  const prefs = (await call('GET', '/notifications/prefs', C)).data;
  assert.ok('data' in prefs.types && !('reminder' in prefs.types));
  await call('PUT', '/notifications/prefs', C, { muted: ['data', 'not-a-type'] });
  assert.deepEqual((await call('GET', '/notifications/prefs', C)).data.prefs.muted, ['data']);
  await call('POST', `/athletes/${id}/bodyweight`, A, { weight: 100.5 });
  assert.equal((await call('GET', '/notifications/unread', C)).data.count, 0);

  // Expired subscriptions are cleaned up.
  gone.add('https://push.example/coach');
  await call('POST', '/comments', A, { body: 'Can I train tomorrow?' });
  await tick();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(c.user.id).n, 0);

  // Daily check-in reminder at the athlete's local time, once per day, skipped if already checked in.
  await call('PUT', '/notifications/prefs', A, { timezone: 'Pacific/Auckland', reminder_time: '07:30' });
  const at = (iso) => new Date(iso);
  const before = (await titles(A)).length;
  // 18:00 UTC = 07:00 next day in Auckland (NZDT, +13): too early.
  assert.equal(runReminders(db, app.locals.notify, at('2026-12-01T18:00:00Z')), 0);
  // 19:00 UTC = 08:00 in Auckland: reminder sent, once.
  assert.equal(localNow('Pacific/Auckland', at('2026-12-01T19:00:00Z')).date, '2026-12-02');
  assert.equal(runReminders(db, app.locals.notify, at('2026-12-01T19:00:00Z')), 1);
  assert.equal(runReminders(db, app.locals.notify, at('2026-12-01T20:00:00Z')), 0);
  assert.equal((await titles(A)).length, before + 1);
  assert.equal((await titles(A))[0], 'Morning check-in');
  // Next day they've already checked in by 08:00 -> no reminder.
  await call('POST', `/athletes/${id}/readiness`, A, { day: '2026-12-03', sleep_quality: 4, energy: 4, soreness: 4, stress: 4, mood: 4 });
  assert.equal(runReminders(db, app.locals.notify, at('2026-12-02T19:00:00Z')), 0);
  // Muting reminders stops them.
  await call('PUT', '/notifications/prefs', A, { muted: ['reminder'] });
  assert.equal(runReminders(db, app.locals.notify, at('2026-12-03T19:00:00Z')), 0);
});
