// In-memory Oktopus used by the Phase 3 tests. Models what we saw on the real system:
//  - login {email,password} -> {token} (JWT with exp); "OTP is required" for a 2FA account
//  - GET /api/device[?id=] with labels as a JSON string; Status 2 = online
//  - PUT /api/device/<SN>/usp/generic: GET -> req_path_results; OPERATE -> ReqObjPath (async LCM
//    commands) or ReqOutputArgs (SetRequestedState). The result of an async command shows up later as
//    the lcm:<UUID> label (what oktopus-lcm-results.lua writes), after `delay` device reads.

import type { OktopusFetch } from '../src/oktopus/client.ts';

export interface FakeDu { inst: number; uuid: string; duid: string; name: string; version: string; url: string; status: string }
export interface FakeEu { inst: number; euid: string; status: string; fault?: string }
export interface FakeDevice {
  sn: string;
  endpointId: string;
  status: number;
  labels: Record<string, string>;
  dus: FakeDu[];
  eus: FakeEu[];
  subs?: Record<string, string>[];   // Device.LocalAgent.Subscription.{i} rows (undefined = none)
}

export interface FakeOptions {
  email?: string;
  password?: string;
  otp?: boolean;               // account has 2FA
  delay?: number;              // device reads before an async result appears
  refuse?: string | null;      // command substring that the agent refuses with CmdFailure
  silent?: string | null;      // command substring that never produces a result (timeout test)
}

function fakeJwt(expSec: number): string {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ email: 'svc@x', exp: expSec })}.sig`;
}

export function fakeOktopus(devices: FakeDevice[], opts: FakeOptions = {}) {
  const o = { email: 'svc@tinno.us', password: 'pw', otp: false, delay: 2, refuse: null, silent: null, ...opts };
  const valid = new Set<string>();
  const pending: { left: number; run: () => void }[] = [];
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let logins = 0;
  let nextInst = 10;
  const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const reply = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? JSON.stringify(body) : JSON.stringify(body)),
  });
  const dev = (sn: string) => devices.find((d) => d.sn === sn);
  const tick = () => {
    for (const p of [...pending]) {
      if (--p.left <= 0) { pending.splice(pending.indexOf(p), 1); p.run(); }
    }
  };
  const raw = (d: FakeDevice) => ({
    SN: d.sn, sn_v2: d.sn, usp_endpoint_id: d.endpointId, Model: 'XB3', Vendor: 'MaxLinear, Inc', Version: '8.6.0',
    Status: d.status, Bridge: [{ Mtp: 'mqtt', Status: d.status, LastSeen: '2026-11-17T09:21:06.834Z' }],
    label: JSON.stringify(Object.entries(d.labels).map(([name, value]) => ({ name, value }))),
  });
  const label = (d: FakeDevice, uuid: string, state: string, op: string, fault: number, version: string) => {
    d.labels[`lcm:${uuid}`] = `${state}|${op}|${fault}|${version}|${now()}`;
  };
  const parseUrl = (url: string) => {
    const m = /^docker:\/\/[^/]+\/(.+):([^:]+)$/.exec(url);
    return m ? { name: m[1], version: m[2] } : { name: url, version: '' };
  };

  function usp(d: FakeDevice, msg: any): unknown {
    const req = msg?.body?.request ?? {};
    if (req.get) {
      const results = (req.get.param_paths as string[]).map((p) => {
        const res: unknown[] = [];
        if (p.endsWith('DeploymentUnit.')) for (const du of d.dus) {
          const eu = d.eus.find((e) => e.euid === du.duid);
          res.push({ resolved_path: `Device.SoftwareModules.DeploymentUnit.${du.inst}.`, result_params: {
            UUID: du.uuid, DUID: du.duid, Name: du.name, Version: du.version, URL: du.url, Status: du.status,
            ExecutionUnitList: eu ? `Device.SoftwareModules.ExecutionUnit.${eu.inst}` : '' } });
        }
        if (p === 'Device.LocalAgent.Subscription.') (d.subs ?? []).forEach((s, i) => {
          res.push({ resolved_path: `Device.LocalAgent.Subscription.${i + 1}.`, result_params: s });
        });
        if (p.endsWith('ExecutionUnit.')) for (const eu of d.eus) {
          res.push({ resolved_path: `Device.SoftwareModules.ExecutionUnit.${eu.inst}.`, result_params: {
            EUID: eu.euid, Status: eu.status, ExecutionFaultCode: eu.fault ?? 'NoFault', ExecutionFaultMessage: '' } });
        }
        return res.length ? { requested_path: p, resolved_path_results: res } : { requested_path: p };
      });
      return { req_path_results: results };
    }
    if (req.add) {
      const row: Record<string, string> = { Recipient: 'Device.LocalAgent.Controller.1' };
      for (const ps of req.add.create_objs[0].param_settings) row[ps.param] = ps.value;
      (d.subs ??= []).push(row);
      return { created_obj_results: [{ requested_path: 'Device.LocalAgent.Subscription.', oper_status: { oper_success: { instantiated_path: `Device.LocalAgent.Subscription.${d.subs.length}.` } } }] };
    }
    const op = req.operate;
    if (!op) return { error: { err_code: 7004, err_msg: 'unsupported message' } };
    const cmd: string = op.command;
    const args: Record<string, string> = op.input_args ?? {};
    if (o.refuse && cmd.includes(o.refuse)) {
      return { operation_results: [{ executed_command: cmd, OperationResp: { CmdFailure: { ErrCode: 7022, ErrMsg: 'refused by agent' } } }] };
    }
    const async = (run: () => void) => {
      if (!(o.silent && cmd.includes(o.silent))) pending.push({ left: o.delay, run });
      return { operation_results: [{ executed_command: cmd, OperationResp: { ReqObjPath: 'Device.LocalAgent.Request.1' } }] };
    };
    const duByPath = (path: string) => d.dus.find((x) => path.startsWith(`Device.SoftwareModules.DeploymentUnit.${x.inst}.`));
    if (cmd === 'Device.SoftwareModules.InstallDU()') {
      return async(() => {
        const { name, version } = parseUrl(args.URL);
        if (args.URL.includes('does-not-exist')) return label(d, args.UUID, 'Failed', 'Install', 7002, '');
        const inst = nextInst++;
        const duid = `duid-${args.UUID.slice(0, 8)}`;
        d.dus.push({ inst, uuid: args.UUID, duid, name, version, url: args.URL, status: 'Installed' });
        d.eus.push({ inst, euid: duid, status: 'Active' });
        label(d, args.UUID, 'Installed', 'Install', 0, version);
      });
    }
    if (cmd.endsWith('.Update()')) {
      const du = duByPath(cmd);
      return async(() => {
        if (!du) return;
        du.version = parseUrl(args.URL).version;
        du.url = args.URL;
        label(d, du.uuid, 'Installed', 'Update', 0, du.version);
      });
    }
    if (cmd.endsWith('.Uninstall()')) {
      const du = duByPath(cmd);
      return async(() => {
        if (!du) return;
        d.dus = d.dus.filter((x) => x !== du);
        d.eus = d.eus.filter((e) => e.euid !== du.duid);
        label(d, du.uuid, 'Uninstalled', 'Uninstall', 0, du.version);
      });
    }
    if (cmd.endsWith('.SetRequestedState()')) {
      const eu = d.eus.find((e) => cmd.startsWith(`Device.SoftwareModules.ExecutionUnit.${e.inst}.`));
      if (eu && !(o.silent && cmd.includes(o.silent))) pending.push({ left: o.delay, run: () => { eu.status = args.RequestedState; } });
      return { operation_results: [{ executed_command: cmd, OperationResp: { ReqOutputArgs: {} } }] };
    }
    return { error: { err_code: 7026, err_msg: `invalid command ${cmd}` } };
  }

  const fetch: OktopusFetch = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path: u.pathname + u.search, body });
    if (init.headers['x-api-version'] !== '2') return reply(400, 'x-api-version missing');
    if (u.pathname === '/api/auth/login' && init.method === 'PUT') {
      logins++;
      if (body?.email !== o.email || body?.password !== o.password) return reply(401, 'Invalid credentials');
      if (o.otp && !body?.otp) return reply(200, 'User and Password are correct, but OTP is required');
      const t = fakeJwt(Math.floor(Date.now() / 1000) + 24 * 3600) + `.${logins}`;
      valid.add(t);
      return reply(200, { token: t, user: { email: o.email } });
    }
    if (!valid.has(init.headers.Authorization)) return reply(401, 'Unauthorized');
    if (u.pathname === '/api/device' && init.method === 'GET') {
      const id = u.searchParams.get('id');
      if (id) {
        tick();
        const d = dev(id);
        return d ? reply(200, raw(d)) : reply(404, 'device not found');
      }
      const page = Number(u.searchParams.get('page_number') ?? 0);
      const size = Number(u.searchParams.get('page_size') ?? 20);
      return reply(200, { devices: devices.slice(page * size, (page + 1) * size).map(raw), total: devices.length });
    }
    const m = /^\/api\/device\/([^/]+)\/usp\/generic$/.exec(u.pathname);
    if (m && init.method === 'PUT') {
      const d = dev(decodeURIComponent(m[1]));
      if (!d) return reply(404, 'device not found');
      if (d.status !== 2) return reply(500, 'device offline');
      return reply(200, usp(d, body));
    }
    return reply(404, 'not found');
  };

  return {
    fetch,
    calls,
    opts: o,
    get logins() { return logins; },
    revokeAll: () => valid.clear(),
  };
}

export function device(sn: string, online = true): FakeDevice {
  return { sn, endpointId: `os::0050F1-${sn}`, status: online ? 2 : 0, labels: {}, dus: [], eus: [] };
}
