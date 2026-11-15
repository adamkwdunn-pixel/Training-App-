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

test('a page that fails on an athlete’s phone is reported to the coach once, with details', async () => {
  const c = (await call('POST', '/auth/register', null, { name: 'Adam', email: 'c@x.com', password: 'password1', role: 'coach' })).data;
  const a = (await call('POST', '/auth/register', null, { name: 'Garin', email: 'g@x.com', password: 'password1', invite_code: c.user.invite_code })).data;
  const report = { message: "Cannot read properties of undefined (reading 'length')", path: '/session/4', stack: 'at Session' };
  assert.equal((await call('POST', '/client-errors', a.token, report)).status, 200);
  assert.equal((await call('POST', '/client-errors', a.token, report)).status, 200); // repeat within the hour
  assert.equal((await call('POST', '/client-errors', null, report)).status, 200); // signed out: logged only
  const list = (await call('GET', '/client-errors', c.token)).data.errors;
  assert.equal(list.length, 2);
  assert.equal(list[0].user_name, 'Garin');
  assert.equal(list[0].path, '/session/4');
  const notes = (await call('GET', '/notifications', c.token)).data.notifications.filter((n) => n.type === 'app_error');
  assert.equal(notes.length, 1); // not spammed
  assert.match(notes[0].title, /Garin/);
  assert.equal((await call('GET', '/client-errors', a.token)).status, 403);
});
