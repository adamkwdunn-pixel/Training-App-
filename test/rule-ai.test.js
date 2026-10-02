import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { cleanRule, RuleAIError } from '../server/lib/rule-ai.js';

const seen = [];
// Stand-in for Claude: returns what the real writer would after cleaning the structured output.
const ruleWriter = async (text, current) => {
  seen.push({ text, current });
  if (/weather/.test(text)) throw new RuleAIError(422, 'That doesn’t read as a progression rule.');
  const kg = /7\.5/.test(text) ? 7.5 : 2.5;
  const { config, notes } = cleanRule({
    clauses: [
      { label: 'Success', when: [{ metric: 'all_reps_completed', op: '==', value: 1 }], then: [{ action: 'adjust_load_kg', value: kg, message: '' }] },
      { label: 'Bad', when: [{ metric: 'mood', op: '>=', value: 1 }], then: [{ action: 'adjust_load_kg', value: 1, message: '' }] },
    ],
    otherwise: [{ action: 'teleport', value: null, message: '' }],
    notes: [],
  });
  return { name: current?.name || 'Simple linear', description: `Add ${kg} kg every successful session.`, config, notes };
};

const server = createApp(openDb(':memory:'), { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null, ruleWriter }).listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
const call = async (method, url, token, body) => {
  const res = await fetch(base + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('cleanRule drops unknown metrics/actions and keeps a hold fallback', () => {
  const { config, notes } = cleanRule({
    clauses: [{ label: 'x', when: [{ metric: 'sleep', op: '>=', value: 7 }], then: [{ action: 'hold' }] }],
    otherwise: [], notes: ['n'],
  });
  assert.equal(config.clauses.length, 0);
  assert.deepEqual(config.otherwise, [{ action: 'hold' }]);
  assert.equal(notes[0], 'n');
  assert.match(notes[1], /sleep/);
});

test('write a rule in plain English, save it, edit it, and it changes the next session', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const C = c.token;
  const a = (await call('POST', '/auth/register', null, { name: 'Sam', email: 's@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  assert.equal((await call('GET', '/rules/meta', C)).data.ai_enabled, true);
  assert.equal((await call('POST', '/rules/ai', a.token, { text: 'add 2.5 kg each time' })).status, 403);
  assert.equal((await call('POST', '/rules/ai', C, { text: 'nice weather today' })).status, 422);

  const d = (await call('POST', '/rules/ai', C, { text: 'Add 2.5 kg every time they complete all reps' })).data.draft;
  assert.equal(d.config.clauses.length, 1); // the bogus "mood" clause is dropped
  assert.deepEqual(d.config.otherwise, [{ action: 'hold' }]);
  assert.ok(d.notes.some((n) => /mood/.test(n)));
  const made = await call('POST', '/rules', C, { name: d.name, description: d.description, config: d.config });
  assert.equal(made.status, 201);
  const ruleId = made.data.id;

  // Program using the rule, assigned to Sam.
  const squat = (await call('GET', '/exercises', C)).data.exercises.find((e) => e.name === 'Back Squat');
  const p = (await call('POST', '/programs', C, { name: 'Block', weeks: 3, days_per_week: 1 })).data.program;
  for (const day of p.days) await call('PUT', `/days/${day.id}`, C, { title: 'Lower', prescriptions: [{ exercise_id: squat.id, sets: 3, reps: '5', load_type: 'fixed', fixed_load: 100 }] });
  await call('PUT', `/programs/${p.id}`, C, { rule_id: ruleId });
  await call('POST', '/assignments', C, { program_id: p.id, athlete_ids: [a.user.id] });
  const rules = (await call('GET', '/rules', C)).data.rules;
  assert.equal(rules.find((r) => r.id === ruleId).program_count, 1);

  const logOnce = async () => {
    const plan = (await call('GET', `/athletes/${a.user.id}/plan`, a.token)).data;
    const next = plan.assignments[0].next_day;
    const rx = next.prescriptions[0];
    await call('POST', '/logs', a.token, {
      assignment_id: plan.assignments[0].id, day_id: next.id,
      sets: [1, 2, 3].map((n) => ({ prescription_id: rx.id, set_number: n, target_load: rx.target_load, weight: rx.target_load, reps: 5 })),
    });
    return rx.target_load;
  };
  assert.equal(await logOnce(), 100);

  // Edit in plain English: the current rule is sent along, and the change applies from the next session.
  const d2 = (await call('POST', '/rules/ai', C, { text: 'Make it 7.5 kg', rule_id: ruleId })).data.draft;
  assert.equal(seen.at(-1).current.name, 'Simple linear');
  assert.equal(seen.at(-1).current.config.clauses[0].then[0].value, 2.5);
  assert.equal((await call('PUT', `/rules/${ruleId}`, C, { name: d2.name, description: d2.description, config: d2.config })).status, 200);
  assert.equal(await logOnce(), 102.5); // first session's +2.5 kg
  const plan = (await call('GET', `/athletes/${a.user.id}/plan`, a.token)).data;
  assert.equal(plan.assignments[0].next_day.prescriptions[0].target_load, 110); // + the edited 7.5 kg

  assert.equal((await call('PUT', `/rules/${ruleId}`, C, { name: 'x', config: { clauses: [], otherwise: [{ action: 'nope' }] } })).status, 400);
});

test('plain-English rules say clearly when the AI key is missing', async () => {
  const s2 = createApp(openDb(':memory:'), { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null, ruleWriter: null }).listen(0);
  test.after(() => s2.close());
  const b2 = `http://localhost:${s2.address().port}/api`;
  const c = await (await fetch(`${b2}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A', email: 'a@x.com', password: 'password1', role: 'coach' }) })).json();
  const res = await fetch(`${b2}/rules/ai`, { method: 'POST', headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'add 2.5 kg each time' }) });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ANTHROPIC_API_KEY/);
});
