import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OktopusClient, jwtExp } from '../src/oktopus/client.ts';
import { duUuid, parseGet, parseLabel, parseOperate, uuidV5, uspError } from '../src/lcm/usp.ts';
import { fakeOktopus, device } from './fakeOktopus.ts';

const base = 'https://okt.example';

test('service account login, devices with labels, re-login after the token is rejected', async () => {
  const d = device('ZT1');
  d.labels['lcm:abc'] = 'Installed|Install|0|v1|2026-11-17T10:00:00Z';
  const fake = fakeOktopus([d, device('OFF1', false)]);
  const c = new OktopusClient({ baseUrl: base, email: 'svc@tinno.us', password: 'pw', fetchImpl: fake.fetch });
  const list = await c.listDevices();
  assert.deepEqual(list.map((x) => [x.sn, x.online]), [['ZT1', true], ['OFF1', false]]);
  assert.equal(list[0].labels['lcm:abc'], 'Installed|Install|0|v1|2026-11-17T10:00:00Z');
  assert.equal(list[0].endpointId, 'os::0050F1-ZT1');
  assert.equal(fake.logins, 1);
  assert.ok(c.tokenExpiresAt > Date.now());

  fake.revokeAll();                      // token rejected -> one re-login, request retried
  assert.equal((await c.getDevice('ZT1'))?.sn, 'ZT1');
  assert.equal(fake.logins, 2);
  assert.equal(await c.getDevice('NOPE'), null);
  const auth = fake.calls.find((x) => x.path.startsWith('/api/device'));
  assert.ok(auth);
});

test('2FA account and pasted token are reported clearly', async () => {
  const fake = fakeOktopus([device('ZT1')], { otp: true });
  const c = new OktopusClient({ baseUrl: base, email: 'svc@tinno.us', password: 'pw', fetchImpl: fake.fetch });
  await assert.rejects(c.listDevices(), /OTP is required.*must not use 2FA/);

  const t = new OktopusClient({ baseUrl: base, token: 'not-a-valid-token', fetchImpl: fakeOktopus([device('ZT1')]).fetch });
  await assert.rejects(t.listDevices(), /HTTP 401/);
  assert.throws(() => new OktopusClient({ baseUrl: base }), /OKTOPUS_EMAIL/);
});

test('page through the device list', async () => {
  const devs = Array.from({ length: 5 }, (_, i) => device(`SN${i}`));
  const c = new OktopusClient({ baseUrl: base, email: 'svc@tinno.us', password: 'pw', fetchImpl: fakeOktopus(devs).fetch });
  assert.equal((await c.listDevices(2)).length, 5);
});

test('USP response parsing: async, sync, CmdFailure, Error, GET', () => {
  assert.deepEqual(parseOperate({ operation_results: [{ executed_command: 'x', OperationResp: { ReqObjPath: 'Device.LocalAgent.Request.1' } }] }),
    { kind: 'async', reqObjPath: 'Device.LocalAgent.Request.1' });
  assert.deepEqual(parseOperate({ operation_results: [{ executed_command: 'x', OperationResp: { ReqOutputArgs: {} } }] }), { kind: 'sync', outputArgs: {} });
  assert.deepEqual(parseOperate({ operation_results: [{ operation_resp: { cmd_failure: { err_code: 7022, err_msg: 'nope' } } }] }),
    { kind: 'failed', error: { code: 7022, message: 'nope' } });
  assert.deepEqual(uspError({ error: { err_code: 7026, err_msg: 'invalid path' } }), { code: 7026, message: 'invalid path' });
  assert.equal(parseOperate({ error: { err_code: 7026, err_msg: 'invalid path' } }).kind, 'failed');
  const rows = parseGet({ req_path_results: [{ requested_path: 'Device.SoftwareModules.DeploymentUnit.' },
    { requested_path: 'Device.SoftwareModules.ExecutionUnit.', resolved_path_results: [{ resolved_path: 'Device.SoftwareModules.ExecutionUnit.1.', result_params: { Status: 'Active', AutoStart: true } }] }] });
  assert.deepEqual(rows, { 'Device.SoftwareModules.ExecutionUnit.1.': { Status: 'Active', AutoStart: 'true' } });
});

test('deterministic v5 UUIDs and result labels', () => {
  assert.equal(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '2ed6657d-e927-568b-95e1-2665a8aea6a2'); // RFC 4122 DNS example
  const a = duUuid('os::0050F1-ZT1', 'tinno-lcm/tinno-ai-service');
  assert.equal(a, duUuid('os::0050F1-ZT1', 'tinno-lcm/tinno-ai-service'));
  assert.notEqual(a, duUuid('os::0050F1-ZT2', 'tinno-lcm/tinno-ai-service'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(parseLabel('Failed|Install|7002||2026-11-17T12:14:33Z'),
    { raw: 'Failed|Install|7002||2026-11-17T12:14:33Z', state: 'Failed', operation: 'Install', faultCode: 7002, version: '', completeTime: '2026-11-17T12:14:33Z' });
  assert.equal(jwtExp('garbage'), 0);
});

test('Update() sends RetainData=true by default and leaves it out when disabled', async () => {
  const { updateMsg } = await import('../src/lcm/usp.ts');
  const args = (m: unknown) => (m as { body: { request: { operate: { input_args: Record<string, string> } } } }).body.request.operate.input_args;
  const on = args(updateMsg('Device.SoftwareModules.DeploymentUnit.1.', 'docker://r/x:v2', { username: 'u', password: 'p' }, 'k'));
  assert.deepEqual(on, { URL: 'docker://r/x:v2', Username: 'u', Password: 'p', RetainData: 'true' });
  const off = args(updateMsg('Device.SoftwareModules.DeploymentUnit.1.', 'docker://r/x:v2', {}, 'k', false));
  assert.deepEqual(off, { URL: 'docker://r/x:v2' });
});
