import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { computeMetrics, applyRule, PRESET_RULES } from '../server/lib/progression.js';

const sent = [];
let mailFails = false;
const mailer = {
  configured: true,
  async send(m) {
    if (mailFails) throw new Error('SMTP down');
    sent.push(m);
  },
};
const db = openDb(':memory:');
const server = createApp(db, { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-')), push: null, mailer }).listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());

async function call(method, url, token, body) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('double progression only adds load at the top of the rep range', () => {
  const rule = PRESET_RULES.find((r) => r.name === 'Double progression (rep range)').config;
  const rx = { sets: 3, reps: '8-12', load_type: 'fixed', metric: 'load' };
  const mid = computeMetrics(rx, [{ weight: 60, reps: 12 }, { weight: 60, reps: 11 }, { weight: 60, reps: 10 }], {});
  assert.equal(mid.all_reps_completed, 1);
  assert.equal(mid.top_of_range, 0);
  assert.equal(applyRule(rule, mid, { load_offset: 0 }).state.load_offset, 0);
  const top = computeMetrics(rx, [{ weight: 60, reps: 12 }, { weight: 60, reps: 12 }, { weight: 60, reps: 13 }], {});
  assert.equal(top.top_of_range, 1);
  assert.equal(applyRule(rule, top, { load_offset: 0 }).state.load_offset, 2.5);
});

test('coach tools: login emails, own athlete profile, program rule, week controls', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'coach@demo.app', password: 'password1', role: 'coach' })).data;
  const C = c.token;

  // --- Sign an athlete up: temporary password is generated and emailed.
  const add = await call('POST', '/athletes', C, { name: 'Sam Taylor', email: 'sam@club.com', position: 'Prop' });
  assert.equal(add.status, 201);
  assert.equal(add.data.email_sent, true);
  assert.match(add.data.login.password, /^[a-z]+-[a-z0-9]{4}-[a-z]+$/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'sam@club.com');
  assert.equal(sent[0].replyTo, 'coach@demo.app');
  assert.ok(sent[0].text.includes(add.data.login.password) && sent[0].text.includes(add.data.login.url));
  // Athlete signs in with it and must choose their own password.
  let login = await call('POST', '/auth/login', null, { email: 'sam@club.com', password: add.data.login.password });
  assert.equal(login.data.user.must_change_password, 1);
  await call('PATCH', '/me', login.data.token, { current_password: add.data.login.password, new_password: 'my-own-pass' });
  assert.equal((await call('GET', '/me', login.data.token)).data.user.must_change_password, 0);
  // Resend / reset: new password, old sessions signed out.
  const reset = await call('POST', `/athletes/${add.data.id}/send-login`, C, {});
  assert.equal(reset.data.email_sent, true);
  assert.equal(sent.at(-1).subject, 'Your new AD Rugby Coaching password');
  assert.equal((await call('GET', '/me', login.data.token)).status, 401);
  // If email fails, the coach still gets the details to share.
  mailFails = true;
  const add2 = await call('POST', '/athletes', C, { name: 'Jo Lee', email: 'jo@club.com' });
  assert.equal(add2.status, 201);
  assert.equal(add2.data.email_sent, false);
  assert.ok(add2.data.login.password);
  mailFails = false;
  assert.equal((await call('POST', '/athletes', C, { name: 'Bad', email: 'not-an-email' })).status, 400);

  // --- Coach edits an athlete's details; snapshot reflects them.
  const ed = await call('PATCH', `/athletes/${add.data.id}`, C, { name: 'Sam T', position: 'Loosehead prop', sex: 'male', birth_date: '2000-05-01', height_cm: 183, bodyweight: 112.4, notes: 'Shoulder history' });
  assert.equal(ed.status, 200);
  assert.equal(ed.data.athlete.name, 'Sam T');
  assert.equal(ed.data.athlete.notes, 'Shoulder history');
  const detail = (await call('GET', `/athletes/${add.data.id}`, C)).data;
  assert.equal(detail.athlete.height_cm, 183);
  assert.equal(detail.snapshot.bodyweight, 112.4);
  assert.ok(detail.snapshot.age >= 25);
  assert.equal(detail.snapshot.sleep_debt.debt_hours, 0);
  assert.equal((await call('PATCH', `/athletes/${add.data.id}`, C, { email: 'jo@club.com' })).status, 409);
  assert.equal((await call('PATCH', `/athletes/${add.data.id}`, C, { height_cm: 6 })).status, 400);
  assert.equal((await call('PATCH', `/athletes/${add.data.id}`, C, { name: '' })).status, 400);

  // --- Coach adds themselves as an athlete and switches between views.
  const me = await call('POST', '/me/athlete-profile', C, {});
  assert.equal(me.status, 201);
  assert.equal(me.data.email, 'coach+athlete@demo.app');
  assert.equal((await call('POST', '/me/athlete-profile', C, {})).status, 409);
  const list = (await call('GET', '/athletes', C)).data;
  assert.equal(list.athletes.find((a) => a.is_me).id, me.data.id);
  const asAthlete = (await call('POST', '/me/switch', C, {})).data;
  assert.equal(asAthlete.user.role, 'athlete');
  assert.equal(asAthlete.user.coach_id, c.user.id);
  const back = (await call('POST', '/me/switch', asAthlete.token, {})).data;
  assert.equal(back.user.id, c.user.id);
  assert.equal((await call('POST', '/me/switch', login.data.token, {})).status, 401);
  // Coach doesn't get notified about their own training.
  await call('POST', '/notifications/read', C, {});
  await call('POST', `/athletes/${me.data.id}/bodyweight`, asAthlete.token, { weight: 95 });
  assert.equal((await call('GET', '/notifications/unread', C)).data.count, 0);
  // Athletes can't reach coach-only APIs.
  assert.equal((await call('GET', '/programs', asAthlete.token)).status, 403);

  // --- Program default progression rule + week controls.
  const { rules } = (await call('GET', '/rules', C)).data;
  const dp = rules.find((r) => r.name === 'Double progression (rep range)');
  assert.ok(dp);
  const { exercises } = (await call('GET', '/exercises', C)).data;
  const bench = exercises.find((e) => e.name === 'Bench Press');
  let p = (await call('POST', '/programs', C, { name: 'Hypertrophy', weeks: 2, days_per_week: 2 })).data.program;
  p = (await call('PUT', `/programs/${p.id}`, C, { rule_id: dp.id })).data.program;
  assert.equal(p.rule_id, dp.id);
  await call('PUT', `/days/${p.days[0].id}`, C, { title: 'Upper A', prescriptions: [{ exercise_id: bench.id, sets: 2, reps: '8-12', load_type: 'fixed', fixed_load: 60 }] });

  p = (await call('POST', `/programs/${p.id}/weeks/1/duplicate`, C, {})).data.program;
  assert.equal(p.weeks, 3);
  assert.deepEqual(p.days.map((d) => d.week), [1, 1, 2, 2, 3, 3]);
  assert.equal(p.days[2].title, 'Upper A');
  assert.equal(p.days[2].prescriptions[0].reps, '8-12');
  p = (await call('DELETE', `/programs/${p.id}/weeks/2`, C)).data.program;
  assert.equal(p.weeks, 2);
  assert.deepEqual(p.days.map((d) => d.week), [1, 1, 2, 2]);
  p = (await call('PUT', `/programs/${p.id}`, C, { weeks: 3 })).data.program;
  assert.equal(p.weeks, 3);
  assert.equal((await call('DELETE', `/programs/${p.id}/weeks/9`, C)).status, 400);

  // The program's rule applies when the athlete's assignment has none.
  await call('POST', '/assignments', C, { program_id: p.id, athlete_ids: [me.data.id] });
  const plan = (await call('GET', `/athletes/${me.data.id}/plan`, asAthlete.token)).data.assignments[0];
  const rx = plan.next_day.prescriptions[0];
  const log = await call('POST', '/logs', asAthlete.token, {
    assignment_id: plan.id, day_id: plan.next_day.id,
    sets: [{ prescription_id: rx.id, weight: 60, reps: 12 }, { prescription_id: rx.id, weight: 60, reps: 12 }],
  });
  assert.equal(log.data.events[0].rule, 'Double progression (rep range)');
  assert.match(log.data.events[0].summary, /\+2.5 kg/);
});

test('remove demo athletes and permanently delete an athlete', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Coach2', email: 'c2@club.com', password: 'password1', role: 'coach' }));
  // Second coach needs the key; use the first coach's DB via a fresh registration path instead.
  assert.ok([201, 403].includes(c.status));
  const login = (await call('POST', '/auth/login', null, { email: 'coach@demo.app', password: 'password1' })).data;
  const C = login.token;
  const code = login.user.invite_code;
  const demo = [];
  for (const n of ['d1', 'd2']) demo.push((await call('POST', '/auth/register', null, { name: n, email: `${n}@demo.app`, password: 'password1', invite_code: code })).data);
  const real = (await call('POST', '/auth/register', null, { name: 'Real', email: 'real@club.com', password: 'password1', invite_code: code })).data;
  await call('POST', `/athletes/${demo[0].user.id}/bodyweight`, demo[0].token, { weight: 90 });
  await call('POST', '/comments', demo[0].token, { body: 'hi coach' });
  await call('POST', `/athletes/${demo[0].user.id}/tests`, demo[0].token, { exercise_id: (await call('GET', '/exercises', C)).data.exercises[0].id, weight: 100, reps: 3 });

  let list = (await call('GET', '/athletes', C)).data;
  assert.equal(list.demo_count, 2);
  const out = await call('POST', '/athletes/remove-demo', C, {});
  assert.deepEqual(out.data.deleted.sort(), ['d1', 'd2']);
  list = (await call('GET', '/athletes', C)).data;
  assert.equal(list.demo_count, 0);
  assert.ok(!list.athletes.some((a) => a.email.endsWith('@demo.app') && !a.is_me));
  assert.equal((await call('POST', '/auth/login', null, { email: 'd1@demo.app', password: 'password1' })).status, 401);
  assert.ok(list.athletes.some((a) => a.is_me)); // the coach's own profile stays

  // Permanent delete vs remove-from-squad
  assert.equal((await call('DELETE', `/athletes/${real.user.id}?permanent=1`, C)).data.deleted, true);
  assert.equal((await call('GET', `/athletes/${real.user.id}`, C)).status, 404);
  assert.equal((await call('POST', '/auth/login', null, { email: 'real@club.com', password: 'password1' })).status, 401);
  assert.equal((await call('POST', '/athletes/remove-demo', real.token, {})).status, 401);
});
