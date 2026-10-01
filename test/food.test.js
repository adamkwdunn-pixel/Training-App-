import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { normalise, EstimateError } from '../server/lib/food-ai.js';

const seen = [];
// Stand-in for Claude: returns what the real estimator would after parsing the structured output.
const estimator = async (text) => {
  seen.push(text);
  if (/homework/.test(text)) throw new EstimateError(422, 'That doesn’t look like food or drink');
  return normalise({
    is_food: true, confidence: 'Medium',
    assumptions: ['Assumed 2 slices of wholemeal bread', 'Assumed 1 tbsp mayonnaise'],
    items: [
      { name: 'Chicken breast', quantity: '100 g', kcal: 165.4, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
      { name: 'Wholemeal bread', quantity: '2 slices', kcal: 160, protein_g: 7.8, carbs_g: 28, fat_g: 2 },
      { name: 'Mayonnaise', quantity: '1 tbsp', kcal: 95, protein_g: 0, carbs_g: 0, fat_g: 10.4 },
      { name: 'Lettuce', quantity: 'a few leaves', kcal: 5, protein_g: 0.4, carbs_g: 1, fat_g: 0 },
    ],
  });
};
const server = createApp(openDb(':memory:'), { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null, estimator }).listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
const call = async (method, url, token, body) => {
  const res = await fetch(base + url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('describe a meal, get an AI estimate, log it against targets', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const a = (await call('POST', '/auth/register', null, { name: 'Sam', email: 's@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  const A = a.token;
  const id = a.user.id;
  assert.equal((await call('GET', '/nutrition/meta', A)).data.ai_enabled, true);

  const text = 'a chicken sandwich with approximately 100g chicken breast, some mayonnaise, some lettuce';
  const est = await call('POST', `/athletes/${id}/food/estimate`, A, { text });
  assert.equal(est.status, 200);
  assert.equal(seen[0], text);
  const e = est.data.estimate;
  assert.equal(e.items.length, 4);
  assert.equal(e.items[0].kcal, 165); // rounded
  assert.deepEqual(e.totals, { kcal: 425, protein: 39, carbs: 29, fat: 16 });
  assert.equal(e.confidence, 'medium');
  assert.equal(e.assumptions.length, 2);

  assert.equal((await call('POST', `/athletes/${id}/food/estimate`, A, { text: 'my homework' })).status, 422);
  assert.equal((await call('POST', `/athletes/${id}/food/estimate`, A, { text: '' })).status, 400);

  // Save it (athlete can tweak totals), plus a manual entry.
  assert.equal((await call('POST', `/athletes/${id}/food`, A, { meal: 'Lunch', description: text, items: e.items, ...e.totals, kcal: 450 })).status, 201);
  assert.equal((await call('POST', `/athletes/${id}/food`, A, { meal: 'Snack', description: 'Protein shake', protein: 25, carbs: 5, fat: 2, source: 'manual' })).status, 201);
  const day = (await call('GET', `/athletes/${id}/food`, A)).data;
  assert.equal(day.entries.length, 2);
  assert.equal(day.entries[0].items[0].name, 'Chicken breast');
  assert.equal(day.totals.kcal, 450 + 25 * 4 + 5 * 4 + 2 * 9);
  assert.equal(day.totals.protein, 64);
  assert.ok('kcal' in day.targets || day.targets.missing);

  // Coach sees it; other athletes can't.
  assert.equal((await call('GET', `/athletes/${id}/food`, c.token)).data.entries.length, 2);
  const other = (await call('POST', '/auth/register', null, { name: 'O', email: 'o@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  assert.equal((await call('GET', `/athletes/${id}/food`, other.token)).status, 403);
  assert.equal((await call('POST', `/athletes/${id}/food/estimate`, other.token, { text })).status, 403);
  assert.equal((await call('DELETE', `/food/${day.entries[1].id}`, other.token)).status, 403);
  assert.equal((await call('DELETE', `/food/${day.entries[1].id}`, A)).status, 200);

  const squad = (await call('GET', '/nutrition/squad', c.token)).data.athletes.find((x) => x.id === id);
  assert.equal(squad.food_days_7d, 1);
  assert.equal(squad.avg_kcal_7d, 450);
});

test('without an API key the estimate endpoint explains, and manual entry still works', async () => {
  const s2 = createApp(openDb(':memory:'), { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'u-')), push: null, estimator: null }).listen(0);
  const b2 = `http://localhost:${s2.address().port}/api`;
  const post = (url, token, body) => fetch(b2 + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() }));
  test.after(() => s2.close());
  const c = (await post('/auth/register', null, { name: 'C', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const a = (await post('/auth/register', null, { name: 'A', email: 'a@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  const r = await post(`/athletes/${a.user.id}/food/estimate`, a.token, { text: 'two eggs' });
  assert.equal(r.status, 503);
  assert.match(r.data.error, /aren’t switched on/);
  assert.equal((await post(`/athletes/${a.user.id}/food`, a.token, { description: 'Two eggs', kcal: 140, protein: 12, source: 'manual' })).status, 201);
});
