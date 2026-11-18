// Shared setup for the Phase 3 tests: fake Oktopus + registry + job engine on a temp data dir.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OktopusClient } from '../src/oktopus/client.ts';
import { DeviceRegistry } from '../src/devices/registry.ts';
import { JobStore } from '../src/jobs/store.ts';
import { JobEngine } from '../src/jobs/engine.ts';
import type { Job } from '../src/jobs/store.ts';
import type { Catalogue } from '../src/catalogue/sync.ts';
import { fakeOktopus } from './fakeOktopus.ts';
import type { FakeOptions, FakeDevice } from './fakeOktopus.ts';

export const AI = 'tinno-lcm/tinno-ai-service';
export const PROBE = 'tinno-lcm/net-probe';

export function catalogue(): Catalogue {
  const svc = (id: string, versions: string[], network: string, privileged: boolean) => ({
    id, projectId: 1, name: id.split('/')[1], description: '', avatarUrl: null, webUrl: '', warnings: [],
    meta: { name: null, tier: 'All', category: 'ai', segments: null, network, hostproc: false, privileged, ramMB: 64, diskMB: null, hw: [], docsis: null, health: { type: 'none' }, graceS: 30, featured: false },
    repository: { id: 1, location: `registry.gitlab.com/${id}` },
    versions, latest: versions[0], lastActivityAt: '2026-11-01T00:00:00Z',
  });
  return {
    group: 'tinno-lcm', builtAt: '2026-11-17T00:00:00Z', issues: [],
    services: [svc(AI, ['v25.0.1', 'v25.0.0'], 'bridged', false), svc(PROBE, ['v1.0.0'], 'shared', true)],
  } as unknown as Catalogue;
}

export async function setup(devices: FakeDevice[], fo: FakeOptions = {}, eo: { timeoutMs?: number; stateTimeoutMs?: number } = {}, dir?: string) {
  dir ??= await mkdtemp(join(tmpdir(), 'lcm-jobs-'));
  const fake = fakeOktopus(devices, fo);
  const client = new OktopusClient({ baseUrl: 'https://okt.example', email: 'svc@tinno.us', password: 'pw', fetchImpl: fake.fetch });
  const cat = catalogue();
  const registry = new DeviceRegistry(client, () => cat, 0);
  const store = new JobStore(dir);
  await store.load();
  const engine = new JobEngine({
    client, registry, store, catalogue: () => cat,
    resolveImage: async (svc, tag) => ({ imageUrl: `docker://registry.gitlab.com/${svc.id}:${tag}`, expectedDigest: `sha256:${tag}` }),
    creds: { username: 'deploy-user', password: 'deploy-secret' },
    execEnvRef: 'Device.SoftwareModules.ExecEnv.1.',
    pollMs: 1, timeoutMs: eo.timeoutMs ?? 5000, stateTimeoutMs: eo.stateTimeoutMs ?? 5000, log: () => {},
  });
  return { fake, client, registry, store, engine, dir };
}

export async function settle(engine: JobEngine, id: string, ms = 4000): Promise<Job> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const j = engine.get(id)!;
    if (!['queued', 'sent', 'running'].includes(j.state)) return j;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error(`job ${id} still ${engine.get(id)?.state}`);
}

