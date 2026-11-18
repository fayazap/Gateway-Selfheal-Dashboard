import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { GitLabClient } from '../src/gitlab/client.ts';
import { CatalogueStore } from '../src/catalogue/store.ts';
import { createApi } from '../src/api.ts';
import { Auth } from '../src/auth/auth.ts';
import { device } from './fakeOktopus.ts';
import { AI, setup, settle } from './helpers.ts';

async function start(authOpts: ConstructorParameters<typeof Auth>[0] = {}) {
  const s = await setup([device('ZT1'), device('ZT2'), device('OFF1', false)]);
  const gl = new GitLabClient({ baseUrl: 'https://gitlab.example', fetchImpl: async () => { throw new Error('unused'); } });
  const store = new CatalogueStore(gl, { group: 'tinno-lcm', tiers: ['Basic'], includePrerelease: false }, s.dir);
  const server = createApi(store, gl, { registry: s.registry, jobs: s.engine, auth: new Auth(authOpts) });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  let cookie = '';
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) } });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return { status: r.status, body: await r.json() as any, setCookie: set };
  };
  const login = (serial: string, code?: string) => call('/auth/login', { method: 'POST', body: JSON.stringify({ serial, code }) });
  return { ...s, server, call, login, close: async () => { server.close(); await rm(s.dir, { recursive: true, force: true }); } };
}

test('serial sign-in: only a connected device, session scoped to it, logout', async () => {
  const t = await start();
  try {
    assert.deepEqual((await t.call('/auth/session')).body, { authMode: 'serial', authenticated: false, sn: null, codeRequired: false, demoHint: null });
    assert.equal((await t.call('/devices')).status, 401);
    assert.equal((await t.call('/services')).status, 401);
    assert.equal((await t.call('/health')).status, 200);

    assert.equal((await t.login('x')).body.error, 'BAD_SERIAL');
    assert.equal((await t.login('NOPE1234')).body.error, 'NOT_CONNECTED');
    const off = await t.login('OFF1');
    assert.deepEqual([off.status, off.body.error], [401, 'NOT_CONNECTED']);

    const ok = await t.login('ZT1');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.sn, 'ZT1');
    assert.match(ok.setCookie ?? '', /lcm_session=[\w-]{20,}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+/);
    assert.equal((await t.call('/auth/session')).body.sn, 'ZT1');

    const devs = await t.call('/devices');
    assert.deepEqual(devs.body.map((d: { sn: string }) => d.sn), ['ZT1']);
    assert.equal((await t.call('/devices/ZT2/apps')).status, 403);
    assert.equal((await t.call('/devices/ZT2/jobs', { method: 'POST', body: JSON.stringify({ op: 'install', service: AI, version: 'v25.0.0' }) })).body.error, 'WRONG_DEVICE');

    const j = await t.call('/devices/ZT1/jobs', { method: 'POST', body: JSON.stringify({ op: 'install', service: AI, version: 'v25.0.0', requestedBy: 'spoofed' }) });
    assert.equal(j.status, 202);
    assert.match(j.body.requestedBy, /^ZT1 @ /);
    await settle(t.engine, j.body.id);
    assert.equal((await t.call('/jobs')).body.length, 1);

    // a job of another device is invisible to this session
    const other = await t.engine.create('ZT2', { op: 'install', service: AI, version: 'v25.0.0' });
    await settle(t.engine, other.id);
    assert.equal((await t.call('/jobs')).body.length, 1);
    assert.equal((await t.call(`/jobs/${other.id}`)).status, 404);

    assert.equal((await t.call('/auth/logout', { method: 'POST' })).status, 200);
    assert.equal((await t.call('/devices')).status, 401);
  } finally {
    await t.close();
  }
});

test('access code, allowed list and rate limit', async () => {
  const t = await start({ accessCode: 's3cret', allowedSns: ['ZT1', 'OFF1'], maxFailures: 3 });
  try {
    assert.equal((await t.call('/auth/session')).body.codeRequired, true);
    assert.equal((await t.login('ZT1')).body.error, 'BAD_CODE');
    assert.equal((await t.login('ZT2', 's3cret')).body.error, 'NOT_CONNECTED');   // online, but not allowed
    assert.equal((await t.login('ZT1', 'wrong')).body.error, 'BAD_CODE');
    const limited = await t.login('ZT1', 's3cret');                                // 3 failures already
    assert.deepEqual([limited.status, limited.body.error], [429, 'TOO_MANY_ATTEMPTS']);
  } finally {
    await t.close();
  }
  const u = await start({ accessCode: 's3cret' });
  try {
    assert.equal((await u.login('zt1', 's3cret')).status, 401);                     // serials are matched as Oktopus stores them
    assert.equal((await u.login('ZT1', 's3cret')).status, 200);
  } finally {
    await u.close();
  }
});

test('expired session is refused', async () => {
  let now = 1_000_000;
  const a = new Auth({ idleMinutes: 1, now: () => now });
  const s = a.create('ZT1', '1.2.3.4');
  const req = { headers: { cookie: `other=1; lcm_session=${s.token}` } } as any;
  assert.equal(a.get(req)?.sn, 'ZT1');
  now += 61_000;
  assert.equal(a.get(req), null);
});
