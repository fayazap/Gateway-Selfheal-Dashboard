// Job engine (Phase 3): one tracked job per LCM operation on one device.
//
//   install / update / uninstall  -> USP OPERATE (async). Result = the device label lcm:<UUID> written
//                                    by oktopus-lcm-results.lua from DUStateChange!, i.e. the first label
//                                    value that differs from the value before the job. OperationComplete
//                                    cannot reach the backend (Oktopus scripts only see Events).
//   start / stop                  -> SetRequestedState (sync), then wait for EU Status Active / Idle.
//
// Rules: one active job per (device, service); device must be online; versions must be in the catalogue;
// timeout a bit longer than the device's own 900 s install limit.

import { randomUUID } from 'node:crypto';
import type { OktopusClient } from '../oktopus/client.ts';
import type { Catalogue, Service } from '../catalogue/sync.ts';
import type { DeviceRegistry, InstalledApp } from '../devices/registry.ts';
import { addSubscriptionMsg, disabledSubscriptions, duUuid, installMsg, missingSubscriptions, parseGet, parseLabel, parseOperate, setRequestedStateMsg, subscriptionsMsg, uninstallMsg, updateMsg, uspError } from '../lcm/usp.ts';
import type { RegistryCreds } from '../lcm/usp.ts';
import { ACTIVE_STATES } from './store.ts';
import type { Job, JobOp, JobState, JobStore } from './store.ts';

export class JobError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface JobRequest {
  op: JobOp;
  service: string;
  version?: string;
  requestedBy?: string;
}

export interface EngineDeps {
  client: OktopusClient;
  registry: DeviceRegistry;
  store: JobStore;
  catalogue: () => Catalogue | null;
  resolveImage: (svc: Service, tag: string) => Promise<{ imageUrl: string; expectedDigest: string }>;
  creds: RegistryCreds;
  execEnvRef: string;
  retainData?: boolean;       // Update keeps the app's data (default true)
  pollMs?: number;            // label / status poll interval
  timeoutMs?: number;         // install/update/uninstall
  stateTimeoutMs?: number;    // start/stop
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

const OPS: JobOp[] = ['install', 'update', 'uninstall', 'start', 'stop'];
const EXPECTED: Record<string, { operation: string; state: string }> = {
  install: { operation: 'install', state: 'installed' },
  update: { operation: 'update', state: 'installed' },
  uninstall: { operation: 'uninstall', state: 'uninstalled' },
};

export class JobEngine {
  private reserved = new Set<string>();
  private subscribed = new Set<string>();   // devices whose LCM subscriptions were checked this run
  private d: Required<Omit<EngineDeps, 'log'>> & { log: (m: string) => void };

  constructor(deps: EngineDeps) {
    this.d = {
      pollMs: 10_000,
      timeoutMs: 16 * 60_000,
      stateTimeoutMs: 120_000,
      now: Date.now,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (m) => console.log(m),
      ...deps,
    } as JobEngine['d'];
  }

  list(f: { device?: string; service?: string; state?: string } = {}): Job[] {
    return this.d.store.all().filter((j) =>
      (!f.device || j.deviceSn === f.device) && (!f.service || j.serviceId === f.service) && (!f.state || j.state === f.state));
  }

  get(id: string): Job | undefined {
    return this.d.store.get(id);
  }

  /** Validate, record and start a job. Throws JobError with an HTTP status for the API. */
  async create(sn: string, req: JobRequest): Promise<Job> {
    if (!req || !OPS.includes(req.op)) throw new JobError(400, 'BAD_OP', `op must be one of ${OPS.join(', ')}`);
    if (!req.service) throw new JobError(400, 'SERVICE_REQUIRED', 'service (catalogue id, e.g. tinno-lcm/tinno-ai-service) is required');
    const key = `${sn}|${req.service}`;
    if (this.reserved.has(key) || this.list({ device: sn, service: req.service }).some((j) => ACTIVE_STATES.includes(j.state))) {
      throw new JobError(409, 'JOB_IN_PROGRESS', `a job for ${req.service} on ${sn} is still running`);
    }
    this.reserved.add(key);
    try {
      const job = await this.prepare(sn, req);
      await this.d.store.put(job);
      const snapshot = { ...job };      // as accepted; progress continues in the background
      void this.run(job);
      return snapshot;
    } finally {
      this.reserved.delete(key);
    }
  }

  /** Continue jobs that were active when the backend stopped. */
  resume(): number {
    const active = this.d.store.all().filter((j) => ACTIVE_STATES.includes(j.state));
    for (const j of active) {
      if (j.state === 'queued') void this.finish(j, 'failed', null, 'backend restarted before the job was sent');
      else {
        j.state = 'running';          // 'sent' = command may have reached the device: watch for the result
        void this.run(j, true);
      }
    }
    return active.length;
  }

  private async prepare(sn: string, req: JobRequest): Promise<Job> {
    const cat = this.d.catalogue();
    if (!cat) throw new JobError(503, 'CATALOGUE_NOT_READY', 'catalogue not built yet');
    const svc = cat.services.find((s) => s.id === req.service);
    if (!svc) throw new JobError(404, 'SERVICE_NOT_FOUND', req.service);

    const device = await this.d.registry.get(sn);
    if (!device) throw new JobError(404, 'DEVICE_NOT_FOUND', sn);
    if (!device.online) throw new JobError(409, 'DEVICE_OFFLINE', `${sn} is not connected to Oktopus`);

    if (req.op === 'install' || req.op === 'update') {
      if (!req.version) throw new JobError(400, 'VERSION_REQUIRED', 'version is required for install/update');
      if (!svc.versions.includes(req.version)) throw new JobError(404, 'VERSION_NOT_FOUND', `${svc.id} has no version ${req.version}`);
    }

    const apps = await this.d.registry.apps(device);
    const myUuid = duUuid(device.endpointId, svc.id);
    const app: InstalledApp | undefined = apps.find((a) => a.uuid === myUuid) ?? apps.find((a) => a.serviceId === svc.id);

    if (req.op === 'install' && app) throw new JobError(409, 'ALREADY_INSTALLED', `${svc.id} ${app.version} is already installed on ${sn}; use update`);
    if (req.op !== 'install' && !app) throw new JobError(404, 'APP_NOT_INSTALLED', `${svc.id} is not installed on ${sn}`);
    if (req.op === 'update' && app && app.version === req.version) throw new JobError(409, 'ALREADY_AT_VERSION', `${sn} already runs ${svc.id} ${req.version}`);
    if ((req.op === 'start' || req.op === 'stop') && !app?.euPath) throw new JobError(409, 'NO_EXECUTION_UNIT', `${svc.id} on ${sn} has no execution unit`);

    let imageUrl: string | null = null;
    let expectedDigest: string | null = null;
    if (req.op === 'install' || req.op === 'update') {
      try {
        ({ imageUrl, expectedDigest } = await this.d.resolveImage(svc, req.version as string));
      } catch (e) {
        throw new JobError(502, 'IMAGE_RESOLVE_FAILED', (e as Error).message);
      }
    }

    const uuid = app?.uuid || myUuid;
    return {
      id: randomUUID(),
      op: req.op,
      deviceSn: sn,
      endpointId: device.endpointId,
      serviceId: svc.id,
      version: req.version ?? app?.version ?? null,
      fromVersion: app?.version ?? null,
      imageUrl,
      expectedDigest,
      uuid,
      duPath: app?.duPath ?? null,
      euPath: app?.euPath ?? null,
      state: 'queued',
      createdAt: new Date(this.d.now()).toISOString(),
      sentAt: null,
      finishedAt: null,
      reqObjPath: null,
      faultCode: null,
      message: null,
      baselineLabel: device.labels[`lcm:${uuid}`] ?? null,
      resultLabel: null,
      requestedBy: req.requestedBy ?? null,
    };
  }

  private async save(job: Job, patch: Partial<Job>): Promise<void> {
    Object.assign(job, patch);
    await this.d.store.put(job);
  }

  private async finish(job: Job, state: JobState, faultCode: number | null, message: string): Promise<void> {
    await this.save(job, { state, faultCode, message, finishedAt: new Date(this.d.now()).toISOString() });
    this.d.log(`[jobs] ${job.op} ${job.serviceId} on ${job.deviceSn}: ${state}${message ? ` (${message})` : ''}`);
  }

  private async run(job: Job, resumed = false): Promise<void> {
    try {
      if (!resumed) await this.send(job);
      if (job.state !== 'running') return;
      if (job.op === 'start' || job.op === 'stop') await this.waitEuState(job);
      else await this.waitLabel(job);
    } catch (e) {
      await this.finish(job, 'failed', null, (e as Error).message);
    }
  }

  /** Make sure the device reports LCM results (see LCM_SUBSCRIPTIONS). Never blocks the job: on any
   *  problem it logs, and the job still runs (it would then time out without a result label). */
  private async ensureSubscriptions(sn: string): Promise<void> {
    if (this.subscribed.has(sn)) return;
    try {
      const have = parseGet(await this.d.client.sendUsp(sn, subscriptionsMsg()));
      for (const id of disabledSubscriptions(have)) this.d.log(`[jobs] ${sn}: subscription ${id} is disabled; LCM results will not arrive`);
      const missing = missingSubscriptions(have);
      for (const s of missing) {
        const err = uspError(await this.d.client.sendUsp(sn, addSubscriptionMsg(s)));
        this.d.log(err
          ? `[jobs] ${sn}: could not add subscription ${s.id}: ${err.message}`
          : `[jobs] ${sn}: added subscription ${s.id} (${s.ref})`);
      }
      if (missing.length === 0 || missingSubscriptions(parseGet(await this.d.client.sendUsp(sn, subscriptionsMsg()))).length === 0) {
        this.subscribed.add(sn);
      } else {
        this.d.log(`[jobs] ${sn}: LCM subscriptions still missing; results may not arrive (see Device.LocalAgent.Subscription.)`);
      }
    } catch (e) {
      this.d.log(`[jobs] ${sn}: subscription check failed: ${(e as Error).message}`);
    }
  }

  private async send(job: Job): Promise<void> {
    const key = `lcm-${job.op}-${job.id.slice(0, 8)}`;
    if (job.op === 'install' || job.op === 'update' || job.op === 'uninstall') await this.ensureSubscriptions(job.deviceSn);
    let msg: unknown;
    switch (job.op) {
      case 'install': {
        const svc = this.d.catalogue()?.services.find((s) => s.id === job.serviceId);
        msg = installMsg({
          url: job.imageUrl as string,
          uuid: job.uuid,
          execEnvRef: this.d.execEnvRef,
          shareParentNetwork: svc?.meta.network === 'shared',
          privileged: Boolean(svc?.meta.privileged),
        }, this.d.creds, key);
        break;
      }
      case 'update': msg = updateMsg(job.duPath as string, job.imageUrl as string, this.d.creds, key, this.d.retainData ?? true); break;
      case 'uninstall': msg = uninstallMsg(job.duPath as string, key); break;
      default: msg = setRequestedStateMsg(job.euPath as string, job.op === 'start' ? 'Active' : 'Idle', key);
    }
    await this.save(job, { state: 'sent', sentAt: new Date(this.d.now()).toISOString() });
    const res = parseOperate(await this.d.client.sendUsp(job.deviceSn, msg));
    if (res.kind === 'failed') {
      await this.finish(job, 'failed', res.error.code || null, `device refused the command: ${res.error.message}`);
      return;
    }
    await this.save(job, { state: 'running', reqObjPath: res.kind === 'async' ? res.reqObjPath : null });
  }

  private expired(job: Job, limit: number): boolean {
    return this.d.now() - Date.parse(job.sentAt ?? job.createdAt) > limit;
  }

  private async waitLabel(job: Job): Promise<void> {
    const want = EXPECTED[job.op];
    while (!this.expired(job, this.d.timeoutMs)) {
      await this.d.sleep(this.d.pollMs);
      let raw: string | undefined;
      try {
        raw = (await this.d.client.getDevice(job.deviceSn))?.labels[`lcm:${job.uuid}`];
      } catch (e) {
        this.d.log(`[jobs] ${job.id}: poll failed: ${(e as Error).message}`);
        continue;
      }
      const label = parseLabel(raw);
      if (!label || label.raw === job.baselineLabel || label.operation.toLowerCase() !== want.operation) continue;
      await this.save(job, { resultLabel: label.raw });
      if (label.state.toLowerCase() === want.state && label.faultCode === 0) {
        if (job.op !== 'uninstall') await this.refreshApp(job);
        await this.finish(job, 'succeeded', null, label.version ? `${label.state} ${label.version}` : label.state);
      } else {
        await this.finish(job, 'failed', label.faultCode || null, `${label.state || 'Failed'}${label.faultCode ? `, fault ${label.faultCode}` : ''}`);
      }
      return;
    }
    await this.finish(job, 'timed_out', null, `no result from the device after ${Math.round(this.d.timeoutMs / 60000)} min`);
  }

  private async waitEuState(job: Job): Promise<void> {
    const want = job.op === 'start' ? 'Active' : 'Idle';
    let last = '';
    while (!this.expired(job, this.d.stateTimeoutMs)) {
      await this.d.sleep(this.d.pollMs);
      try {
        const app = await this.findApp(job);
        last = app?.euStatus ?? 'missing';
        if (app?.euStatus === want) {
          await this.save(job, { euPath: app.euPath, duPath: app.duPath });
          await this.finish(job, 'succeeded', null, want);
          return;
        }
      } catch (e) {
        this.d.log(`[jobs] ${job.id}: poll failed: ${(e as Error).message}`);
      }
    }
    await this.finish(job, 'failed', null, `execution unit did not become ${want} (last status ${last || 'unknown'})`);
  }

  private async findApp(job: Job): Promise<InstalledApp | undefined> {
    const device = await this.d.client.getDevice(job.deviceSn);
    if (!device) return undefined;
    return (await this.d.registry.apps(device)).find((a) => a.uuid === job.uuid);
  }

  /** Best effort: record where the DU/EU ended up (instance numbers change). */
  private async refreshApp(job: Job): Promise<void> {
    try {
      const app = await this.findApp(job);
      if (app) await this.save(job, { duPath: app.duPath, euPath: app.euPath, version: app.version || job.version });
    } catch { /* result already known from the label */ }
  }
}
