import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { GitLabClient } from '../src/gitlab/client.ts';
import { CatalogueStore } from '../src/catalogue/store.ts';
import { createApi } from '../src/api.ts';
import { fakeGitlab, SAMPLE } from './fakeGitlab.ts';

let server: Server;
let base: string;
let dir: string;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lcm-api-'));
  const gl = fakeGitlab('tinno-lcm', SAMPLE);
  const client = new GitLabClient({ baseUrl: 'https://gitlab.example', fetchImpl: gl.fetch });
  const store = new CatalogueStore(client, { group: 'tinno-lcm', tiers: ['Basic', 'Advanced', 'Business'], includePrerelease: false }, dir);
  server = createApi(store, client);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

test('503 before first refresh, then services listed', async () => {
  assert.equal((await fetch(`${base}/services`)).status, 503);
  const r = await fetch(`${base}/catalogue/refresh`, { method: 'POST' });
  assert.deepEqual(await r.json(), { builtAt: (await (await fetch(`${base}/health`)).json()).catalogue.builtAt, services: 2, issues: 3 });
  const list = await (await fetch(`${base}/services`)).json();
  assert.equal(list.length, 2);
  assert.equal(list[0].tier, 'Business');
});

test('filters, detail, version resolve, issues', async () => {
  const sec = await (await fetch(`${base}/services?category=security`)).json();
  assert.deepEqual(sec.map((s: { id: string }) => s.id), ['tinno-lcm/security-plus']);
  const q = await (await fetch(`${base}/services?q=telemetry`)).json();
  assert.equal(q[0].id, 'tinno-lcm/wan-monitor');

  const id = encodeURIComponent('tinno-lcm/security-plus');
  const detail = await (await fetch(`${base}/services/${id}`)).json();
  assert.deepEqual(detail.versions, ['v2.1.0', 'v2.0.0']);

  const v = await (await fetch(`${base}/services/${id}/versions/v2.0.0`)).json();
  assert.equal(v.digest, 'sha256:aaa');

  assert.equal((await fetch(`${base}/services/${id}/versions/v9.9.9`)).status, 404);
  assert.equal((await fetch(`${base}/services/${encodeURIComponent('tinno-lcm/nope')}`)).status, 404);

  const issues = await (await fetch(`${base}/catalogue/issues`)).json();
  assert.equal(issues.length, 3);
});
