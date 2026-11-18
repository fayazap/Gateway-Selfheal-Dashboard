// Demo mode: the real backend and dashboard against an in-memory GitLab and modem, so the UI can be
// tried (and shown) without Oktopus or the device. Jobs take a few seconds, like the real modem.
//   npm run demo   ->  http://localhost:8080/

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitLabClient } from '../src/gitlab/client.ts';
import { CatalogueStore } from '../src/catalogue/store.ts';
import { resolveVersion } from '../src/catalogue/sync.ts';
import { createApi } from '../src/api.ts';
import { OktopusClient } from '../src/oktopus/client.ts';
import { DeviceRegistry } from '../src/devices/registry.ts';
import { JobStore } from '../src/jobs/store.ts';
import { JobEngine } from '../src/jobs/engine.ts';
import { fakeGitlab } from '../test/fakeGitlab.ts';
import type { FakeProject } from '../test/fakeGitlab.ts';
import { fakeOktopus, device } from '../test/fakeOktopus.ts';
import { Auth } from '../src/auth/auth.ts';
import { listen } from '../src/launch.ts';

const MB = 1048576;
const tag = (name: string, digest: string, size = 40) => ({ name, digest, size: size * MB });
const project = (id: number, name: string, meta: string, desc: string, tags: ReturnType<typeof tag>[]): FakeProject => ({
  id, path: `tinno-lcm/${name}`, name, description: `${desc} [lcm ${meta}]`,
  repos: [{ id: id * 10, path: `tinno-lcm/${name}`, tags }],
});

const projects: FakeProject[] = [
  project(1, 'tinno-ai-service', 'name=Tinno AI Service; tier=All; category=ai; featured=true',
    'Anomaly detection and self-healing agent for the D4.0 gateway: watches modem health and corrects faults without operator action.',
    [tag('v25.0.0', 'sha256:a0'), tag('v25.0.1', 'sha256:a1')]),
  project(2, 'security-plus', 'name=Security Plus; tier=Business; category=security; network=shared; privileged=true; hw=wan',
    'Threat detection, DPI and anomaly monitoring on WAN and LAN interfaces.', [tag('v2.0.0', 'sha256:b0'), tag('v2.1.0', 'sha256:b1')]),
  project(3, 'network-diagnostics', 'name=Network diagnostics; tier=All; category=ai',
    'One-click modem and WAN health assessment with guided remediation.', [tag('v1.2.0', 'sha256:c0')]),
  project(4, 'speed-test', 'name=Speed test; tier=All; category=analytics; hw=wan',
    'On-device DOCSIS throughput and latency benchmarking.', [tag('v0.9.3', 'sha256:d0')]),
  project(5, 'docsis-analytics', 'name=DOCSIS analytics; tier=Business; category=docsis',
    'Channel quality trends, SNR/MER logging and proactive margin alerts.', [tag('v3.0.0', 'sha256:e0')]),
  project(6, 'wan-monitor', 'name=WAN monitor; tier=All; category=docsis; hw=wan',
    'Continuous upstream reachability, packet loss and latency telemetry.', [tag('v1.4.2', 'sha256:f0')]),
  project(7, 'wifi-optimizer', 'name=Wi-Fi optimizer; tier=All; category=analytics; hw=wifi',
    'Channel and band steering recommendations for the home Wi-Fi.', [tag('v1.0.0', 'sha256:g0')]),
];

const dir = await mkdtemp(join(tmpdir(), 'lcm-demo-'));
const gl = fakeGitlab('tinno-lcm', projects);
const client = new GitLabClient({ baseUrl: 'https://gitlab.example', fetchImpl: gl.fetch });
const store = new CatalogueStore(client, { group: 'tinno-lcm', tiers: ['Basic', 'Advanced', 'Business'], includePrerelease: false }, dir);
await store.refresh();

const modem = device('ZT2607000024');
const fake = fakeOktopus([modem, device('OTHER0001', false)], { delay: 4 });
const okt = new OktopusClient({ baseUrl: 'https://oktopus.example', email: 'svc@tinno.us', password: 'pw', fetchImpl: fake.fetch });
const registry = new DeviceRegistry(okt, () => store.get(), 0);
const jobs = new JobEngine({
  client: okt, registry, store: new JobStore(dir), catalogue: () => store.get(),
  resolveImage: (svc, t) => resolveVersion(client, svc, t),
  creds: { username: 'demo', password: 'demo' }, execEnvRef: 'Device.SoftwareModules.ExecEnv.1.',
  pollMs: 1000, timeoutMs: 120_000, stateTimeoutMs: 60_000, log: (m) => console.log(m),
});

const port = Number(process.env.PORT ?? 8080);
const auth = (process.env.LCM_AUTH ?? 'serial') === 'off' ? null : new Auth({ accessCode: process.env.LCM_ACCESS_CODE || undefined });
const api = createApi(store, client, { registry, jobs, auth }, { publicDir: process.env.LCM_PUBLIC_DIR ?? './public', deviceHw: ['wan'], demoHint: 'ZT2607000024' });
listen(api, port, process.env.LCM_HOST ?? '127.0.0.1', (process.env.LCM_OPEN_BROWSER ?? 'false') === 'true', () => {
  console.log(`[demo] fake GitLab (${projects.length} services) + fake modem ZT2607000024 (hw: wan); OTHER0001 is offline`);
  console.log(`[demo] sign in with serial ZT2607000024`);
}, { fallback: (process.env.LCM_PORT_FALLBACK ?? 'false') === 'true' });
