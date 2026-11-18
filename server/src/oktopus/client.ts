// Oktopus Enterprise REST client (Phase 3).
// Calls were taken from the Oktopus web UI (HAR capture, x-api-version 2):
//   PUT /api/auth/login                     {email, password} -> {token}   (JWT, ~24 h)
//   GET /api/device?page_number=&page_size= -> {devices:[...]}           (labels included)
//   GET /api/device?id=<SN>                 -> device
//   PUT /api/device/<SN>/usp/generic        full USP message (snake_case JSON) -> USP response
// Auth header is the raw token: "Authorization: <jwt>" (no "Bearer").
// Sign-in uses a service account without 2FA; a pasted token (OKTOPUS_TOKEN) works for development.

export type OktopusFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface OktopusOptions {
  baseUrl: string;
  email?: string;
  password?: string;
  token?: string;
  apiVersion?: string;
  fetchImpl?: OktopusFetch;
  now?: () => number;
}

export interface OktopusDevice {
  sn: string;
  endpointId: string;
  model: string;
  vendor: string;
  version: string;
  status: number;           // Oktopus status: 2 = online, 0 = offline
  online: boolean;
  lastSeen: string | null;
  labels: Record<string, string>;
}

export class OktopusError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, what: string) {
    super(`Oktopus ${what} failed: HTTP ${status} ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

const RELOGIN_MARGIN_MS = 10 * 60 * 1000;

export class OktopusClient {
  private opts: Required<Pick<OktopusOptions, 'baseUrl' | 'apiVersion'>> & OktopusOptions;
  private token: string | null;
  private tokenExp = 0;
  private loginInflight: Promise<void> | null = null;
  private fetchImpl: OktopusFetch;
  private now: () => number;

  constructor(opts: OktopusOptions) {
    this.opts = { apiVersion: '2', ...opts, baseUrl: opts.baseUrl.replace(/\/+$/, '') };
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as OktopusFetch);
    this.now = opts.now ?? Date.now;
    this.token = opts.token ?? null;
    this.tokenExp = this.token ? jwtExp(this.token) : 0;
    if (!this.token && !(opts.email && opts.password)) {
      throw new Error('Oktopus needs OKTOPUS_EMAIL + OKTOPUS_PASSWORD (service account) or OKTOPUS_TOKEN');
    }
  }

  get canRelogin(): boolean {
    return Boolean(this.opts.email && this.opts.password);
  }

  /** Token expiry (ms since epoch), 0 when unknown. */
  get tokenExpiresAt(): number {
    return this.tokenExp;
  }

  private async login(): Promise<void> {
    if (!this.canRelogin) throw new Error('Oktopus token expired or rejected and no service account is configured (OKTOPUS_EMAIL/OKTOPUS_PASSWORD)');
    if (!this.loginInflight) {
      this.loginInflight = (async () => {
        const res = await this.fetchImpl(`${this.opts.baseUrl}/api/auth/login`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-api-version': this.opts.apiVersion },
          body: JSON.stringify({ email: this.opts.email, password: this.opts.password }),
        });
        const text = await res.text();
        if (!res.ok) throw new OktopusError(res.status, text, 'login');
        let token: string | undefined;
        try { token = (JSON.parse(text) as { token?: string }).token; } catch { /* plain-text reply */ }
        if (!token) {
          // e.g. "User and Password are correct, but OTP is required"
          throw new Error(`Oktopus login did not return a token: ${text.slice(0, 120)} (the service account must not use 2FA)`);
        }
        this.token = token;
        this.tokenExp = jwtExp(token);
      })().finally(() => { this.loginInflight = null; });
    }
    return this.loginInflight;
  }

  private async ensureToken(): Promise<string> {
    const expiring = this.tokenExp > 0 && this.tokenExp - this.now() < RELOGIN_MARGIN_MS;
    if (!this.token || (expiring && this.canRelogin)) await this.login();
    return this.token as string;
  }

  /** Authenticated request; re-login once on 401/403 when a service account is configured. */
  private async request(method: string, path: string, body?: unknown, what = path): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.ensureToken();
      const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
        method,
        headers: {
          'Authorization': token,
          'x-api-version': this.opts.apiVersion,
          'Content-Type': 'application/json',
          'Accept': '*/*',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if ((res.status === 401 || res.status === 403) && attempt === 0 && this.canRelogin) {
        this.token = null;
        continue;
      }
      if (!res.ok) throw new OktopusError(res.status, text, what);
      return text;
    }
    throw new Error('unreachable');
  }

  async listDevices(pageSize = 100): Promise<OktopusDevice[]> {
    const out: OktopusDevice[] = [];
    for (let page = 0; page < 1000; page++) {
      const text = await this.request('GET', `/api/device?page_number=${page}&page_size=${pageSize}&statusOrder=desc`, undefined, 'device list');
      const devs = ((JSON.parse(text) as { devices?: RawDevice[] }).devices) ?? [];
      out.push(...devs.map(toDevice));
      if (devs.length < pageSize) break;
    }
    return out;
  }

  async getDevice(sn: string): Promise<OktopusDevice | null> {
    try {
      const text = await this.request('GET', `/api/device?id=${encodeURIComponent(sn)}`, undefined, `device ${sn}`);
      const raw = JSON.parse(text) as RawDevice;
      return raw && raw.SN ? toDevice(raw) : null;
    } catch (e) {
      if (e instanceof OktopusError && e.status === 404) return null;
      throw e;
    }
  }

  /** Send a full USP message to a device and return the parsed USP response. */
  async sendUsp(sn: string, msg: unknown): Promise<unknown> {
    const text = await this.request('PUT', `/api/device/${encodeURIComponent(sn)}/usp/generic`, msg, `USP message to ${sn}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }
}

interface RawDevice {
  SN: string;
  usp_endpoint_id?: string;
  Model?: string;
  Vendor?: string;
  Version?: string;
  Status?: number;
  Bridge?: { LastSeen?: string }[];
  label?: string;
}

function toDevice(d: RawDevice): OktopusDevice {
  const labels: Record<string, string> = {};
  if (d.label) {
    try {
      for (const l of JSON.parse(d.label) as { name: string; value: string }[]) labels[l.name] = l.value;
    } catch { /* ignore malformed labels */ }
  }
  const seen = (d.Bridge ?? []).map((b) => b.LastSeen).filter(Boolean).sort().pop() ?? null;
  return {
    sn: d.SN,
    endpointId: d.usp_endpoint_id ?? '',
    model: d.Model ?? '',
    vendor: d.Vendor ?? '',
    version: d.Version ?? '',
    status: d.Status ?? 0,
    online: d.Status === 2,
    lastSeen: seen,
    labels,
  };
}

/** exp claim of a JWT in ms, 0 when it cannot be read. */
export function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}
