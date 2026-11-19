/**
 * End-to-end smoke test for the accounts API: starts the server on a random port
 * with an in-memory DB. Run: node test/smoke.ts
 */
import assert from 'node:assert/strict';
import { startServer } from '../src/index.ts';

const srv = await startServer(0, ':memory:');
const base = `http://127.0.0.1:${srv.port}`;
let passed = 0;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log('  ✔', name);
  } catch (e) {
    console.log('  ✘', name);
    throw e;
  }
}

try {
  let token = '';

  await step('health', async () => {
    const r = await call('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
  });

  await step('register validation', async () => {
    assert.equal((await call('POST', '/auth/register', undefined, { callsign: 'ab', name: 'X', password: '12345678' })).status, 400);
    assert.equal((await call('POST', '/auth/register', undefined, { callsign: 'Кирил', name: 'X', password: '12345678' })).status, 400);
    assert.equal((await call('POST', '/auth/register', undefined, { callsign: 'Valid', name: 'X', password: 'short' })).status, 400);
  });

  await step('register', async () => {
    const r = await call('POST', '/auth/register', undefined, { callsign: 'Falcon', name: 'Олег', password: 'password-a' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    token = r.data.token;
    assert.deepEqual(Object.keys(r.data.user).sort(), ['callsign', 'id', 'name']);
    assert.equal(r.data.user.callsign, 'Falcon');
  });

  await step('duplicate callsign (case-insensitive) → 409', async () => {
    assert.equal((await call('POST', '/auth/register', undefined, { callsign: 'falcon', name: 'X', password: 'password-x' })).status, 409);
  });

  await step('login ok / wrong password', async () => {
    assert.equal((await call('POST', '/auth/login', undefined, { callsign: 'falcon', password: 'password-a' })).status, 200);
    assert.equal((await call('POST', '/auth/login', undefined, { callsign: 'Falcon', password: 'nope-nope' })).status, 401);
  });

  await step('me requires auth', async () => {
    assert.equal((await call('GET', '/me')).status, 401);
    assert.equal((await call('GET', '/me', 'garbage')).status, 401);
    const me = await call('GET', '/me', token);
    assert.equal(me.data.callsign, 'Falcon');
  });

  await step('removed features are gone', async () => {
    for (const [m, p] of [['GET', '/friends'], ['GET', '/chats'], ['GET', '/users/search?q=a'], ['POST', '/uploads'], ['PATCH', '/me']]) {
      assert.equal((await call(m, p, token, m === 'GET' ? undefined : {})).status, 404, `${m} ${p}`);
    }
  });

  await step('logout invalidates token', async () => {
    await call('POST', '/auth/logout', token);
    assert.equal((await call('GET', '/me', token)).status, 401);
  });

  console.log(`\nAll ${passed} checks passed.`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await srv.close();
}
