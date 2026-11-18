// USP messages for LCM (Device.SoftwareModules) and parsers for the responses Oktopus returns.
// Message format = what the Oktopus Custom RPC accepts: full USP message, snake_case JSON.

import { randomUUID, createHash } from 'node:crypto';

export const SM = 'Device.SoftwareModules.';

export interface RegistryCreds { username?: string; password?: string }

function msgId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function getMsg(paths: string[]): unknown {
  return { header: { msg_id: msgId('lcm-get'), msg_type: 'GET' }, body: { request: { get: { param_paths: paths, max_depth: 0 } } } };
}

function operate(command: string, commandKey: string, args: Record<string, string>): unknown {
  return {
    header: { msg_id: msgId('lcm-op'), msg_type: 'OPERATE' },
    body: { request: { operate: { command, command_key: commandKey, send_resp: true, input_args: args } } },
  };
}

function credArgs(c: RegistryCreds): Record<string, string> {
  const a: Record<string, string> = {};
  if (c.username) a.Username = c.username;
  if (c.password) a.Password = c.password;
  return a;
}

export interface InstallParams {
  url: string;
  uuid: string;
  execEnvRef: string;
  shareParentNetwork: boolean;
  privileged: boolean;
}

export function installMsg(p: InstallParams, creds: RegistryCreds, commandKey: string): unknown {
  const args: Record<string, string> = { URL: p.url, UUID: p.uuid, ExecutionEnvRef: p.execEnvRef, ...credArgs(creds) };
  if (p.privileged) args.Privileged = 'true';
  if (p.shareParentNetwork) args['NetworkConfig.ShareParentNetwork'] = 'true';
  return operate(`${SM}InstallDU()`, commandKey, args);
}

// retainData: keep the app's data (the container's writable layer) across the update. Needs usp-pa v10,
// which forwards RetainData to timingila; with older usp-pa the data is wiped as before.
export function updateMsg(duPath: string, url: string, creds: RegistryCreds, commandKey: string, retainData = true): unknown {
  const args: Record<string, string> = { URL: url, ...credArgs(creds) };
  if (retainData) args.RetainData = 'true';
  return operate(`${duPath}Update()`, commandKey, args);
}

// ---------------------------------------------------------------------------------------------
// Subscriptions the device needs so LCM results reach Oktopus: DUStateChange! feeds
// oktopus-lcm-results.lua (the lcm:<UUID> labels the jobs wait for); OperationComplete is for
// Oktopus's own request tracking. A factory-fresh device has neither, so the engine adds the
// missing ones before the first install/update/uninstall. Persistent = kept across reboots.

export interface LcmSubscription { id: string; notifType: string; ref: string; covers: string[] }

// ref = what a new subscription gets (the lists proven on ZT2607000024).
// covers = any one of these in an existing subscription's ReferenceList is enough.
export const LCM_SUBSCRIPTIONS: LcmSubscription[] = [
  { id: 'lcm-dustate', notifType: 'Event', ref: `${SM}DUStateChange!`, covers: [`${SM}DUStateChange!`] },
  {
    id: 'lcm-opcomplete', notifType: 'OperationComplete',
    ref: `${SM}InstallDU(),${SM}DeploymentUnit.*.Uninstall(),${SM}DeploymentUnit.*.Update()`,
    covers: [SM, `${SM}InstallDU()`],
  },
];

export function subscriptionsMsg(): unknown {
  return getMsg(['Device.LocalAgent.Subscription.']);
}

export function addSubscriptionMsg(s: LcmSubscription): unknown {
  const p = (param: string, value: string, required = true) => ({ param, value, required });
  return {
    header: { msg_id: msgId('lcm-add'), msg_type: 'ADD' },
    body: { request: { add: { allow_partial: false, create_objs: [{ obj_path: 'Device.LocalAgent.Subscription.', param_settings: [
      p('ID', s.id), p('NotifType', s.notifType), p('ReferenceList', s.ref), p('Persistent', 'true', false), p('Enable', 'true'),
    ] }] } } },
  };
}

const isEnabled = (v: string | undefined) => !['false', '0'].includes(String(v ?? 'true').toLowerCase());

/** LCM subscriptions missing from a GET of Device.LocalAgent.Subscription. A subscription with our ID
 *  counts as present even if its list differs (an ADD with the same ID would be refused anyway). */
export function missingSubscriptions(subs: Record<string, Record<string, string>>): LcmSubscription[] {
  const rows = Object.values(subs);
  return LCM_SUBSCRIPTIONS.filter((w) => !rows.some((r) => r.ID === w.id || (
    r.NotifType === w.notifType && isEnabled(r.Enable) &&
    (r.ReferenceList ?? '').split(',').map((x) => x.trim()).some((x) => w.covers.includes(x)))));
}

/** Our own subscriptions that exist but are switched off (results would not arrive). */
export function disabledSubscriptions(subs: Record<string, Record<string, string>>): string[] {
  return Object.values(subs).filter((r) => LCM_SUBSCRIPTIONS.some((w) => w.id === r.ID) && !isEnabled(r.Enable)).map((r) => r.ID);
}

export function uninstallMsg(duPath: string, commandKey: string): unknown {
  return operate(`${duPath}Uninstall()`, commandKey, {});
}

export function setRequestedStateMsg(euPath: string, state: 'Active' | 'Idle', commandKey: string): unknown {
  return operate(`${euPath}SetRequestedState()`, commandKey, { RequestedState: state });
}

// ---------------------------------------------------------------------------------------------
// Response parsing. Oktopus has returned both PascalCase (OperationResp/ReqObjPath) and snake_case
// keys depending on the message, so look keys up case- and underscore-insensitively.

function norm(k: string): string {
  return k.replace(/_/g, '').toLowerCase();
}

function pick(o: unknown, ...keys: string[]): unknown {
  if (!o || typeof o !== 'object') return undefined;
  const want = new Set(keys.map(norm));
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (want.has(norm(k))) return v;
  return undefined;
}

export interface UspError { code: number; message: string }

/** Top-level USP Error message, if the response is one. */
export function uspError(resp: unknown): UspError | null {
  const err = pick(resp, 'error') ?? pick(pick(pick(resp, 'body'), 'error'), 'error');
  const e = err ?? (pick(resp, 'errcode') !== undefined ? resp : undefined);
  if (!e) return null;
  return { code: Number(pick(e, 'errcode', 'code') ?? 0), message: String(pick(e, 'errmsg', 'message') ?? JSON.stringify(e)) };
}

export type OperateResult =
  | { kind: 'async'; reqObjPath: string }
  | { kind: 'sync'; outputArgs: Record<string, string> }
  | { kind: 'failed'; error: UspError };

export function parseOperate(resp: unknown): OperateResult {
  const top = uspError(resp);
  if (top) return { kind: 'failed', error: top };
  const results = pick(resp, 'operationresults', 'operation_results') as unknown[] | undefined;
  const r = Array.isArray(results) ? results[0] : undefined;
  if (!r) return { kind: 'failed', error: { code: 0, message: `unexpected OPERATE response: ${JSON.stringify(resp).slice(0, 200)}` } };
  const op = pick(r, 'operationresp', 'operation_resp') ?? r;
  const fail = pick(op, 'cmdfailure', 'cmd_failure');
  if (fail) return { kind: 'failed', error: { code: Number(pick(fail, 'errcode') ?? 0), message: String(pick(fail, 'errmsg') ?? 'command failed') } };
  const reqObj = pick(op, 'reqobjpath', 'req_obj_path');
  if (typeof reqObj === 'string' && reqObj) return { kind: 'async', reqObjPath: reqObj };
  const out = pick(op, 'reqoutputargs', 'req_output_args', 'outputargs');
  if (out && typeof out === 'object') return { kind: 'sync', outputArgs: out as Record<string, string> };
  return { kind: 'sync', outputArgs: {} };
}

/** GET response -> { "<resolved_path>": { param: value } } */
export function parseGet(resp: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const reqs = pick(resp, 'reqpathresults', 'req_path_results') as unknown[] | undefined;
  for (const rp of Array.isArray(reqs) ? reqs : []) {
    const resolved = pick(rp, 'resolvedpathresults', 'resolved_path_results') as unknown[] | undefined;
    for (const r of Array.isArray(resolved) ? resolved : []) {
      const path = String(pick(r, 'resolvedpath', 'resolved_path') ?? '');
      const params = (pick(r, 'resultparams', 'result_params') ?? {}) as Record<string, unknown>;
      out[path] = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// One DU UUID per (device, service): install/update/uninstall always target the same DU and the
// operator never types UUIDs. RFC 4122 version 5 (SHA-1, name-based).

const LCM_NAMESPACE = '3b0b6f4e-8f7a-4c51-9d7e-2b6a1f0c9e41';

export function uuidV5(name: string, namespace = LCM_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(ns).update(name, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export function duUuid(endpointId: string, serviceId: string): string {
  return uuidV5(`${endpointId}|${serviceId}`);
}

// ---------------------------------------------------------------------------------------------
// Result label written by oktopus-lcm-results.lua: lcm:<UUID> = State|Operation|FaultCode|Version|CompleteTime

export interface LcmLabel { raw: string; state: string; operation: string; faultCode: number; version: string; completeTime: string }

export function parseLabel(raw: string | undefined): LcmLabel | null {
  if (!raw) return null;
  const [state = '', operation = '', fault = '0', version = '', completeTime = ''] = raw.split('|');
  return { raw, state, operation, faultCode: Number(fault) || 0, version, completeTime };
}
