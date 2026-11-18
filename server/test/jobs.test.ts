import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { DeviceRegistry } from '../src/devices/registry.ts';
import { JobEngine, JobError } from '../src/jobs/engine.ts';
import { duUuid } from '../src/lcm/usp.ts';
import { device } from './fakeOktopus.ts';
import { AI, PROBE, catalogue, setup, settle } from './helpers.ts';

test('install -> update -> stop -> start -> uninstall on one device', async () => {
  const d = device('ZT1');
  const { fake, engine, registry, dir } = await setup([d]);
  try {
    const inst = await engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.0' });
    assert.equal(inst.state, 'queued');
    assert.equal(inst.uuid, duUuid(d.endpointId, AI));
    let j = await settle(engine, inst.id);
    assert.equal(j.state, 'succeeded', j.message ?? '');
    assert.equal(j.reqObjPath, 'Device.LocalAgent.Request.1');
    assert.match(j.resultLabel ?? '', /^Installed\|Install\|0\|v25\.0\.0\|/);
    assert.match(j.duPath ?? '', /^Device\.SoftwareModules\.DeploymentUnit\.\d+\.$/);

    const op = fake.calls.find((c) => c.body && (c.body as any).body?.request?.operate?.command?.includes('InstallDU'))!.body as any;
    const args = op.body.request.operate.input_args;
    assert.equal(args.URL, `docker://registry.gitlab.com/${AI}:v25.0.0`);
    assert.equal(args.Username, 'deploy-user');
    assert.equal(args['NetworkConfig.ShareParentNetwork'], undefined);
    assert.ok(!JSON.stringify(j).includes('deploy-secret'), 'registry password must not be stored in the job');

    let apps = await registry.apps((await registry.get('ZT1'))!);
    assert.equal(apps.length, 1);
    assert.deepEqual([apps[0].serviceId, apps[0].version, apps[0].euStatus, apps[0].managed, apps[0].updateAvailable], [AI, 'v25.0.0', 'Active', true, true]);
    assert.equal(apps[0].lastResult?.state, 'Installed');

    j = await settle(engine, (await engine.create('ZT1', { op: 'update', service: AI, version: 'v25.0.1' })).id);
    assert.equal(j.state, 'succeeded', j.message ?? '');
    assert.equal(j.fromVersion, 'v25.0.0');
    apps = await registry.apps((await registry.get('ZT1'))!);
    assert.deepEqual([apps[0].version, apps[0].updateAvailable], ['v25.0.1', false]);

    j = await settle(engine, (await engine.create('ZT1', { op: 'stop', service: AI })).id);
    assert.equal(j.state, 'succeeded', j.message ?? '');
    assert.equal(d.eus[0].status, 'Idle');
    j = await settle(engine, (await engine.create('ZT1', { op: 'start', service: AI })).id);
    assert.equal(j.state, 'succeeded', j.message ?? '');
    assert.equal(d.eus[0].status, 'Active');

    j = await settle(engine, (await engine.create('ZT1', { op: 'uninstall', service: AI })).id);
    assert.equal(j.state, 'succeeded', j.message ?? '');
    assert.equal(d.dus.length, 0);

    // reinstall reuses the same UUID: the old "Uninstalled" label must not be taken as the result
    j = await settle(engine, (await engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.1' })).id);
    assert.equal(j.state, 'succeeded', j.message ?? '');
    assert.equal(j.baselineLabel?.split('|')[0], 'Uninstalled');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('shared-network privileged service gets NetworkConfig + Privileged', async () => {
  const { fake, engine, dir } = await setup([device('ZT1')]);
  try {
    await settle(engine, (await engine.create('ZT1', { op: 'install', service: PROBE, version: 'v1.0.0' })).id);
    const args = (fake.calls.find((c) => (c.body as any)?.body?.request?.operate?.command?.includes('InstallDU'))!.body as any).body.request.operate.input_args;
    assert.equal(args['NetworkConfig.ShareParentNetwork'], 'true');
    assert.equal(args.Privileged, 'true');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('failures: agent refusal, timeout', async () => {
  const b = await setup([device('ZT1')], { refuse: 'InstallDU' });
  try {
    const j = await settle(b.engine, (await b.engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.0' })).id);
    assert.equal(j.state, 'failed');
    assert.equal(j.faultCode, 7022);
    assert.match(j.message ?? '', /refused/);
  } finally {
    await rm(b.dir, { recursive: true, force: true });
  }

  const c = await setup([device('ZT1')], { silent: 'InstallDU' }, { timeoutMs: 30 });
  try {
    const j = await settle(c.engine, (await c.engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.0' })).id);
    assert.equal(j.state, 'timed_out');
  } finally {
    await rm(c.dir, { recursive: true, force: true });
  }
});

test('bad image is reported with the device fault code', async () => {
  const s = await setup([device('ZT1')]);
  try {
    const cat = catalogue();
    (cat.services[0] as any).versions.push('does-not-exist');
    // resolveImage points the install at a missing image
    const engine = new JobEngine({
      client: s.client, registry: new DeviceRegistry(s.client, () => cat, 0), store: s.store, catalogue: () => cat,
      resolveImage: async () => ({ imageUrl: 'docker://registry.gitlab.com/tinno-lcm/does-not-exist:v0.0.1', expectedDigest: '' }),
      creds: {}, execEnvRef: 'Device.SoftwareModules.ExecEnv.1.', pollMs: 1, log: () => {},
    });
    const j = await settle(engine, (await engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.0' })).id);
    assert.equal(j.state, 'failed');
    assert.equal(j.faultCode, 7002);
    assert.match(j.message ?? '', /Failed, fault 7002/);
  } finally {
    await rm(s.dir, { recursive: true, force: true });
  }
});

test('request validation', async () => {
  const { engine, dir } = await setup([device('ZT1'), device('OFF1', false)]);
  const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as JobError).code; } };
  try {
    assert.equal(await code(engine.create('ZT1', { op: 'reboot' as any, service: AI })), 'BAD_OP');
    assert.equal(await code(engine.create('ZT1', { op: 'install', service: 'x/y', version: 'v1' })), 'SERVICE_NOT_FOUND');
    assert.equal(await code(engine.create('NOPE', { op: 'install', service: AI, version: 'v25.0.0' })), 'DEVICE_NOT_FOUND');
    assert.equal(await code(engine.create('OFF1', { op: 'install', service: AI, version: 'v25.0.0' })), 'DEVICE_OFFLINE');
    assert.equal(await code(engine.create('ZT1', { op: 'install', service: AI })), 'VERSION_REQUIRED');
    assert.equal(await code(engine.create('ZT1', { op: 'install', service: AI, version: 'v9.9.9' })), 'VERSION_NOT_FOUND');
    assert.equal(await code(engine.create('ZT1', { op: 'uninstall', service: AI })), 'APP_NOT_INSTALLED');

    const first = engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.0' });
    assert.equal(await code(engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.0' })), 'JOB_IN_PROGRESS');
    const j = await settle(engine, (await first).id);
    assert.equal(j.state, 'succeeded');
    assert.equal(await code(engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.1' })), 'ALREADY_INSTALLED');
    assert.equal(await code(engine.create('ZT1', { op: 'update', service: AI, version: 'v25.0.0' })), 'ALREADY_AT_VERSION');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('jobs survive a backend restart and are resumed', async () => {
  const d = device('ZT1');
  const a = await setup([d], { delay: 1_000_000 }, { timeoutMs: 300 });   // result never arrives while the first backend runs
  const job = await a.engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.0' });
  const end = Date.now() + 2000;
  while (a.engine.get(job.id)!.state !== 'running' && Date.now() < end) await new Promise((r) => setTimeout(r, 2));
  assert.equal(a.engine.get(job.id)!.state, 'running');
  await new Promise((r) => setTimeout(r, 20));

  // "restart": new engine on the same data dir; the device has finished in the meantime
  d.labels[`lcm:${job.uuid}`] = 'Installed|Install|0|v25.0.0|2026-11-17T12:00:00Z';
  const b = await setup([d], {}, {}, a.dir);
  try {
    assert.equal(b.engine.get(job.id)!.state, 'running');
    assert.equal(b.engine.resume(), 1);
    const j = await settle(b.engine, job.id);
    assert.equal(j.state, 'succeeded', j.message ?? '');
  } finally {
    await rm(a.dir, { recursive: true, force: true });
  }
});

test('single-device mode hides and refuses other devices', async () => {
  const s = await setup([device('ZT1'), device('ZT2')]);
  try {
    const reg = new DeviceRegistry(s.client, catalogue, 0, Date.now, 'ZT1');
    assert.deepEqual((await reg.list()).map((d) => d.sn), ['ZT1']);
    assert.equal(await reg.get('ZT2'), null);
    const engine = new JobEngine({
      client: s.client, registry: reg, store: s.store, catalogue, creds: {}, execEnvRef: 'Device.SoftwareModules.ExecEnv.1.',
      resolveImage: async (svc, tag) => ({ imageUrl: `docker://registry.gitlab.com/${svc.id}:${tag}`, expectedDigest: '' }), pollMs: 1, log: () => {},
    });
    await assert.rejects(engine.create('ZT2', { op: 'install', service: AI, version: 'v25.0.0' }), (e: JobError) => e.code === 'DEVICE_NOT_FOUND');
    const j = await settle(engine, (await engine.create('ZT1', { op: 'install', service: AI, version: 'v25.0.0' })).id);
    assert.equal(j.state, 'succeeded');
  } finally {
    await rm(s.dir, { recursive: true, force: true });
  }
});

test('fresh device: missing LCM subscriptions are added once before the first install', async () => {
  const d = device('ZT9');
  d.subs = [{ ID: 'default-boot-event-ACS', NotifType: 'Event', ReferenceList: 'Device.Boot!', Enable: 'true' }];
  const { fake, engine } = await setup([d]);
  const adds = () => fake.calls.filter((c) => (c.body as any)?.body?.request?.add).length;
  const inst = await engine.create('ZT9', { op: 'install', service: AI, version: 'v25.0.0' });
  assert.equal((await settle(engine, inst.id)).state, 'succeeded');
  assert.equal(adds(), 2);
  const refs = d.subs!.map((s) => `${s.NotifType}:${s.ReferenceList}:${s.Persistent}`);
  assert.ok(refs.includes('Event:Device.SoftwareModules.DUStateChange!:true'));
  assert.ok(refs.includes('OperationComplete:Device.SoftwareModules.InstallDU(),Device.SoftwareModules.DeploymentUnit.*.Uninstall(),Device.SoftwareModules.DeploymentUnit.*.Update():true'));
  const un = await engine.create('ZT9', { op: 'uninstall', service: AI });
  assert.equal((await settle(engine, un.id)).state, 'succeeded');
  assert.equal(adds(), 2, 'checked once per device, not before every job');
});

test('device that already has the subscriptions gets no ADD', async () => {
  const d = device('ZT8');
  d.subs = [
    { ID: 'x1', NotifType: 'Event', ReferenceList: 'Device.SoftwareModules.DUStateChange!', Enable: '1' },
    { ID: 'x2', NotifType: 'OperationComplete', ReferenceList: 'Device.SoftwareModules.', Enable: 'true' },
  ];
  const { fake, engine } = await setup([d]);
  const inst = await engine.create('ZT8', { op: 'install', service: AI, version: 'v25.0.0' });
  assert.equal((await settle(engine, inst.id)).state, 'succeeded');
  assert.equal(fake.calls.filter((c) => (c.body as any)?.body?.request?.add).length, 0);
});

test('subscriptions as found on ZT2607000024 (05/11 lists) count as present', async () => {
  const d = device('ZT7');
  d.subs = [
    { ID: 'default-boot-event-ACS', NotifType: 'Event', ReferenceList: 'Device.Boot!', Enable: 'true' },
    { ID: 'lcm-dustate', NotifType: 'Event', ReferenceList: 'Device.SoftwareModules.DUStateChange!', Enable: 'true' },
    { ID: 'lcm-opcomplete', NotifType: 'OperationComplete', Enable: 'true',
      ReferenceList: 'Device.SoftwareModules.InstallDU(),Device.SoftwareModules.DeploymentUnit.*.Uninstall(),Device.SoftwareModules.DeploymentUnit.*.Update()' },
  ];
  const { fake, engine } = await setup([d]);
  const inst = await engine.create('ZT7', { op: 'install', service: AI, version: 'v25.0.0' });
  assert.equal((await settle(engine, inst.id)).state, 'succeeded');
  assert.equal(fake.calls.filter((c) => (c.body as any)?.body?.request?.add).length, 0);
});
