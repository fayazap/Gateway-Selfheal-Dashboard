import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { GitLabClient } from '../src/gitlab/client.ts';
import { CatalogueStore } from '../src/catalogue/store.ts';
import { createApi } from '../src/api.ts';
import { device } from './fakeOktopus.ts';
import { setup, settle } from './helpers.ts';

let server: Server;
let base: string;
let dir: string;
let engine: Awaited<ReturnType<typeof setup>>['engine'];

before(async () => {
  const s = await setup([device('ZT1'), device('OFF1', false)]);
  dir = s.dir;
  engine = s.engine;
  const gl = new GitLabClient({ baseUrl: 'https://gitlab.example', fetchImpl: async () => { throw new Error('unused'); } });
  const store = new CatalogueStore(gl, { group: 'tinno-lcm', tiers: ['Basic'], includePrerelease: false }, dir);
  server = createApi(store, gl, { registry: s.registry, jobs: s.engine });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('devices, apps, jobs over HTTP', async () => {
  const devs = await (await fetch(`${base}/devices`)).json();
  assert.deepEqual(devs.map((d: { sn: string; online: boolean }) => [d.sn, d.online]), [['ZT1', true], ['OFF1', false]]);
  assert.deepEqual((await (await fetch(`${base}/devices?online=true`)).json()).length, 1);
  assert.equal((await fetch(`${base}/devices/NOPE`)).status, 404);
  assert.equal((await fetch(`${base}/devices/OFF1/apps`)).status, 409);
  assert.deepEqual(await (await fetch(`${base}/devices/ZT1/apps`)).json(), []);

  const r = await post('/devices/ZT1/jobs', { op: 'install', service: 'tinno-lcm/tinno-ai-service', version: 'v25.0.0' });
  assert.equal(r.status, 202);
  const job = await r.json();
  assert.equal((await post('/devices/ZT1/jobs', { op: 'install', service: 'tinno-lcm/tinno-ai-service', version: 'v25.0.0' })).status, 409);
  await settle(engine, job.id);
  const done = await (await fetch(`${base}/jobs/${job.id}`)).json();
  assert.equal(done.state, 'succeeded');

  const apps = await (await fetch(`${base}/devices/ZT1/apps`)).json();
  assert.equal(apps[0].version, 'v25.0.0');
  assert.equal(apps[0].updateAvailable, true);

  assert.equal((await (await fetch(`${base}/jobs?device=ZT1&state=succeeded`)).json()).length, 1);
  assert.equal((await fetch(`${base}/jobs/nope`)).status, 404);

  const bad = await post('/devices/OFF1/jobs', { op: 'install', service: 'tinno-lcm/tinno-ai-service', version: 'v25.0.0' });
  assert.equal(bad.status, 409);
  assert.equal((await bad.json()).error, 'DEVICE_OFFLINE');
  const badJson = await fetch(`${base}/devices/ZT1/jobs`, { method: 'POST', body: '{nope' });
  assert.equal(badJson.status, 400);
  assert.equal((await (await fetch(`${base}/health`)).json()).oktopus, 'configured');
});
