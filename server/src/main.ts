// Entry point: load config, warm the catalogue (cache first, then GitLab), set up Oktopus devices + jobs
// (Phase 3, when configured), serve the API.

import { loadConfig } from './config.ts';
import { GitLabClient } from './gitlab/client.ts';
import { CatalogueStore } from './catalogue/store.ts';
import { resolveVersion } from './catalogue/sync.ts';
import { createApi } from './api.ts';
import type { Phase3 } from './api.ts';
import { OktopusClient } from './oktopus/client.ts';
import { DeviceRegistry } from './devices/registry.ts';
import { JobStore } from './jobs/store.ts';
import { JobEngine } from './jobs/engine.ts';
import { Auth } from './auth/auth.ts';
import { listen } from './launch.ts';

const cfg = loadConfig();
const client = new GitLabClient({ baseUrl: cfg.gitlabUrl, token: cfg.gitlabToken });
const store = new CatalogueStore(
  client,
  { group: cfg.gitlabGroup, tiers: cfg.tiers, includePrerelease: cfg.includePrerelease },
  cfg.dataDir,
);

if (await store.loadCache()) console.log('[catalogue] loaded cached catalogue');
store.refresh()
  .then((c) => console.log(`[catalogue] ${c.services.length} services, ${c.issues.length} issues from ${c.group}`))
  .catch((e) => console.error(`[catalogue] refresh failed: ${(e as Error).message}`));
store.startTimer(cfg.refreshMinutes);

let p3: Phase3 | null = null;
if (cfg.oktopus) {
  const okt = new OktopusClient({ baseUrl: cfg.oktopus.url, email: cfg.oktopus.email, password: cfg.oktopus.password, token: cfg.oktopus.token });
  const registry = new DeviceRegistry(okt, () => store.get(), 30_000, Date.now, cfg.deviceSn);
  const jobStore = new JobStore(cfg.dataDir);
  console.log(`[jobs] ${await jobStore.load()} jobs loaded`);
  if (!cfg.registryUsername || !cfg.registryPassword) {
    console.warn('[jobs] REGISTRY_USERNAME/REGISTRY_PASSWORD not set: installs only work from a public registry');
  }
  const jobs = new JobEngine({
    client: okt,
    registry,
    store: jobStore,
    catalogue: () => store.get(),
    resolveImage: (svc, tag) => resolveVersion(client, svc, tag),
    creds: { username: cfg.registryUsername, password: cfg.registryPassword },
    execEnvRef: cfg.execEnvRef,
    retainData: cfg.retainData,
    pollMs: cfg.pollSeconds * 1000,
    timeoutMs: cfg.jobTimeoutMinutes * 60_000,
  });
  const resumed = jobs.resume();
  if (resumed) console.log(`[jobs] resumed ${resumed} active job(s)`);
  const auth = cfg.auth === 'serial' ? new Auth({ accessCode: cfg.accessCode, allowedSns: cfg.allowedSns }) : null;
  p3 = { registry, jobs, auth };
  console.log(auth
    ? `[auth] sign-in with the device serial number${cfg.accessCode ? ' + access code' : ''}${cfg.allowedSns ? ` (allowed: ${cfg.allowedSns.join(', ')})` : ''}`
    : '[auth] OFF: anyone who can open the dashboard can manage the device (LCM_AUTH=off)');
  console.log(`[oktopus] ${cfg.oktopus.url} (${cfg.oktopus.email ? `service account ${cfg.oktopus.email}` : 'pasted token, no re-login'})`);
  console.log(cfg.deviceSn ? `[devices] single-device mode: ${cfg.deviceSn}` : '[devices] all devices in the Oktopus organization');
} else {
  console.log('[oktopus] not configured: device and job endpoints disabled');
}

listen(createApi(store, client, p3, { publicDir: cfg.publicDir, deviceHw: cfg.deviceHw }), cfg.port, cfg.host, cfg.openBrowser, () => {
  console.log(`[api] LCM Dashboard backend on ${cfg.host} (group ${cfg.gitlabGroup})`);
}, { fallback: cfg.portFallback });
