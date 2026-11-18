// Typed access to the backend REST API (same origin: the backend serves this dashboard).

export interface ServiceSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  segments: string[] | null;
  featured: boolean;
  avatarUrl: string | null;
  latest: string;
  versions: string[];
  network: 'bridged' | 'shared' | 'none';
  privileged: boolean;
  hw: string[];
  compatible: { ok: boolean; reason: string | null };
}

export interface Device {
  sn: string;
  endpointId: string;
  model: string;
  vendor: string;
  firmware: string;
  online: boolean;
  lastSeen: string | null;
}

export interface LcmLabel { raw: string; state: string; operation: string; faultCode: number; version: string; completeTime: string }

export interface InstalledApp {
  duPath: string;
  uuid: string;
  duid: string;
  name: string;
  version: string;
  duStatus: string;
  euPath: string | null;
  euStatus: string | null;
  euFault: string | null;
  serviceId: string | null;
  managed: boolean;
  latest: string | null;
  updateAvailable: boolean;
  lastResult: LcmLabel | null;
}

export type JobOp = 'install' | 'update' | 'uninstall' | 'start' | 'stop';
export type JobState = 'queued' | 'sent' | 'running' | 'succeeded' | 'failed' | 'timed_out';
export const ACTIVE: JobState[] = ['queued', 'sent', 'running'];

export interface Job {
  id: string;
  op: JobOp;
  deviceSn: string;
  endpointId: string;
  serviceId: string;
  version: string | null;
  fromVersion: string | null;
  imageUrl: string | null;
  expectedDigest: string | null;
  uuid: string;
  duPath: string | null;
  euPath: string | null;
  state: JobState;
  createdAt: string;
  sentAt: string | null;
  finishedAt: string | null;
  reqObjPath: string | null;
  faultCode: number | null;
  message: string | null;
  baselineLabel: string | null;
  resultLabel?: string | null;
  requestedBy: string | null;
}

export interface Health {
  ok: boolean;
  catalogue: { group: string | null; builtAt: string | null; services: number; issues: number };
  refresh: { lastAttempt: string | null; lastSuccess: string | null; lastError: string | null; running: boolean };
  oktopus: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const BASE = '/api/v1';

/** Called when the backend says the session is gone (expired, signed out elsewhere, backend restarted). */
let onAuthLost: (() => void) | null = null;
export function setAuthLostHandler(f: (() => void) | null) { onAuthLost = f; }

export interface SessionInfo { authMode: 'serial' | 'off'; authenticated: boolean; sn: string | null; codeRequired: boolean; demoHint: string | null }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError(0, 'BACKEND_UNREACHABLE', 'Cannot reach the dashboard backend. Is it running?');
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string };
    if (res.status === 401 && b.error === 'AUTH_REQUIRED') onAuthLost?.();
    throw new ApiError(res.status, b.error ?? `HTTP_${res.status}`, b.message ?? b.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  session: () => call<SessionInfo>('/auth/session'),
  login: (serial: string, code: string) => call<{ sn: string; device: Device }>('/auth/login', { method: 'POST', body: JSON.stringify({ serial, code: code || undefined }) }),
  logout: () => call<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  health: () => call<Health>('/health'),
  services: () => call<ServiceSummary[]>('/services'),
  refreshCatalogue: () => call<{ builtAt: string; services: number; issues: number }>('/catalogue/refresh', { method: 'POST' }),
  devices: () => call<Device[]>('/devices'),
  apps: (sn: string) => call<InstalledApp[]>(`/devices/${encodeURIComponent(sn)}/apps`),
  jobs: (sn?: string) => call<Job[]>(`/jobs${sn ? `?device=${encodeURIComponent(sn)}` : ''}`),
  job: (id: string) => call<Job>(`/jobs/${encodeURIComponent(id)}`),
  createJob: (sn: string, body: { op: JobOp; service: string; version?: string }) =>
    call<Job>(`/devices/${encodeURIComponent(sn)}/jobs`, { method: 'POST', body: JSON.stringify({ ...body, requestedBy: 'dashboard' }) }),
};

/** Human wording for backend error codes. */
export function explain(e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      DEVICE_OFFLINE: 'The modem is not connected to Oktopus right now.',
      JOB_IN_PROGRESS: 'Another job for this app is still running. Wait for it to finish.',
      ALREADY_INSTALLED: 'This app is already installed. Use Update instead.',
      ALREADY_AT_VERSION: 'The modem already runs that version.',
      APP_NOT_INSTALLED: 'This app is not installed on the modem.',
      VERSION_NOT_FOUND: 'That version is not in the catalogue any more. Refresh the catalogue.',
      IMAGE_RESOLVE_FAILED: 'GitLab did not return the image for that version.',
      OKTOPUS_NOT_CONFIGURED: 'The backend has no Oktopus account configured.',
      OKTOPUS_ERROR: 'Oktopus returned an error.',
    };
    return `${map[e.code] ?? e.message}${map[e.code] && e.message && e.code !== 'BACKEND_UNREACHABLE' ? ` (${e.message})` : ''}`;
  }
  return (e as Error)?.message ?? String(e);
}
