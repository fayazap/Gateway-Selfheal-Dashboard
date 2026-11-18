// REST API (subset of design §13.1), node:http only — no framework yet.
// Phase 1 (catalogue):
//   GET  /api/v1/health
//   GET  /api/v1/services?category=&q=
//   GET  /api/v1/services/{serviceId}               serviceId = URL-encoded path_with_namespace
//   GET  /api/v1/services/{serviceId}/versions/{tag} resolves digest + image URLs
//   GET  /api/v1/catalogue/issues
//   POST /api/v1/catalogue/refresh
// Sign-in (when LCM_AUTH=serial, the default): everything except health and auth needs a session.
//   GET  /api/v1/auth/session                       {authMode, authenticated, sn, codeRequired, demoHint}
//   POST /api/v1/auth/login                         {serial, code?} -> session cookie (device must be online in Oktopus)
//   POST /api/v1/auth/logout
// Phase 3 (devices + jobs, needs Oktopus configured; limited to the signed-in device):
//   GET  /api/v1/devices?online=true&q=
//   GET  /api/v1/devices/{sn}
//   GET  /api/v1/devices/{sn}/apps
//   POST /api/v1/devices/{sn}/jobs                  {op, service, version?}
//   GET  /api/v1/jobs?device=&service=&state=
//   GET  /api/v1/jobs/{id}

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { GitLabClient } from './gitlab/client.ts';
import type { CatalogueStore } from './catalogue/store.ts';
import { resolveVersion } from './catalogue/sync.ts';
import type { Service } from './catalogue/sync.ts';
import type { DeviceRegistry } from './devices/registry.ts';
import { summary } from './devices/registry.ts';
import type { JobEngine, JobRequest } from './jobs/engine.ts';
import { JobError } from './jobs/engine.ts';
import { OktopusError } from './oktopus/client.ts';
import { Auth, AuthError, clientIp, setCookie } from './auth/auth.ts';
import type { Session } from './auth/auth.ts';

export interface Phase3 {
  registry: DeviceRegistry;
  jobs: JobEngine;
  auth?: Auth | null;         // serial-number sign-in; null/undefined = open API (development)
}

export interface ApiOptions {
  publicDir?: string;        // built dashboard (index.html + assets); served for every non-API path
  deviceHw?: string[];       // hardware the managed device has (wan, wifi, moca); unset = assume all
  demoHint?: string;         // demo mode: serial number shown on the sign-in page
}

/** A service fits the device unless it needs hardware the device does not have. */
export function compatible(s: Service, deviceHw?: string[]): { ok: boolean; reason: string | null } {
  if (!deviceHw) return { ok: true, reason: null };
  const missing = s.meta.hw.filter((h) => !deviceHw.includes(h));
  return missing.length ? { ok: false, reason: `needs ${missing.join(', ')}; this device has ${deviceHw.join(', ') || 'none'}` } : { ok: true, reason: null };
}

export function serviceSummary(s: Service, deviceHw?: string[]) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.meta.category,
    tier: s.meta.tier,
    segments: s.meta.segments,
    featured: s.meta.featured,
    avatarUrl: s.avatarUrl,
    latest: s.latest,
    versions: s.versions,
    network: s.meta.network,
    privileged: s.meta.privileged,
    hw: s.meta.hw,
    compatible: compatible(s, deviceHw),
  };
}

export function createApi(store: CatalogueStore, client: GitLabClient, p3: Phase3 | null = null, opts: ApiOptions = {}): Server {
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (!path.startsWith('/api/') && opts.publicDir && (req.method === 'GET' || req.method === 'HEAD')) {
      serveStatic(res, opts.publicDir, path).catch(() => send(res, 500, { error: 'INTERNAL' }));
      return;
    }
    handle(req, res, store, client, p3, opts).catch((e) => {
      if (e instanceof JobError || e instanceof AuthError) return send(res, e.status, { error: e.code, message: e.message });
      if (e instanceof OktopusError) return send(res, 502, { error: 'OKTOPUS_ERROR', status: e.status, message: e.message });
      return send(res, 500, { error: 'INTERNAL', message: (e as Error).message });
    });
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, store: CatalogueStore, client: GitLabClient, p3: Phase3 | null, opts: ApiOptions = {}) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const method = req.method ?? 'GET';

  if (parts[0] !== 'api' || parts[1] !== 'v1') return send(res, 404, { error: 'NOT_FOUND' });
  const [, , resource, ...rest] = parts;

  if (method === 'GET' && resource === 'health' && rest.length === 0) {
    const cat = store.get();
    return send(res, 200, {
      ok: true,
      catalogue: { group: cat?.group ?? null, builtAt: cat?.builtAt ?? null, services: cat?.services.length ?? 0, issues: cat?.issues.length ?? 0 },
      refresh: store.status,
      oktopus: p3 ? 'configured' : 'not configured',
    });
  }

  // ---- sign-in (serial number of a device connected to the ACS) ----
  const auth = p3?.auth ?? null;
  if (resource === 'auth') {
    if (method === 'GET' && rest[0] === 'session') {
      const s = auth?.get(req) ?? null;
      return send(res, 200, {
        authMode: auth ? 'serial' : 'off', authenticated: auth ? Boolean(s) : true,
        sn: s?.sn ?? null, codeRequired: auth?.codeRequired ?? false, demoHint: opts.demoHint ?? null,
      });
    }
    if (!auth || !p3) return send(res, 404, { error: 'AUTH_DISABLED' });
    if (method === 'POST' && rest[0] === 'login') {
      const ip = clientIp(req);
      const body = (await readJson(req)) as { serial?: unknown; code?: unknown };
      const serial = auth.precheck(ip, body.serial, body.code);
      const dev = await p3.registry.get(serial);
      if (!dev || !dev.online) throw auth.fail(ip, 401, 'NOT_CONNECTED', 'This device is not connected to the ACS.');
      const session = auth.create(dev.sn, ip);
      setCookie(res, auth.cookie(session));
      console.log(`[auth] signed in: ${dev.sn} from ${ip}`);
      return send(res, 200, { sn: dev.sn, device: summary(dev) });
    }
    if (method === 'POST' && rest[0] === 'logout') {
      auth.destroy(req);
      setCookie(res, auth.cookie(null));
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'NOT_FOUND' });
  }
  let session: Session | null = null;
  if (auth) {
    session = auth.get(req);
    if (!session) return send(res, 401, { error: 'AUTH_REQUIRED', message: 'Sign in with the device serial number.' });
  }

  if (resource === 'catalogue') {
    if (method === 'GET' && rest[0] === 'issues' && rest.length === 1) {
      return send(res, 200, store.get()?.issues ?? []);
    }
    if (method === 'POST' && rest[0] === 'refresh' && rest.length === 1) {
      try {
        const cat = await store.refresh();
        return send(res, 200, { builtAt: cat.builtAt, services: cat.services.length, issues: cat.issues.length });
      } catch (e) {
        return send(res, 502, { error: 'GITLAB_ERROR', message: (e as Error).message });
      }
    }
  }

  if (resource === 'services' && method === 'GET') {
    const cat = store.get();
    if (!cat) return send(res, 503, { error: 'CATALOGUE_NOT_READY', message: 'catalogue not built yet; POST /api/v1/catalogue/refresh' });

    if (rest.length === 0) {
      const category = url.searchParams.get('category');
      const q = url.searchParams.get('q')?.toLowerCase();
      const list = cat.services
        .filter((s) => !category || s.meta.category === category)
        .filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
        .map((s) => serviceSummary(s, opts.deviceHw));
      return send(res, 200, list);
    }

    // serviceId may itself contain '/', so locate "versions" from the end.
    const vIdx = rest.lastIndexOf('versions');
    const isVersion = vIdx > 0 && vIdx === rest.length - 2;
    const serviceId = (isVersion ? rest.slice(0, vIdx) : rest).join('/');
    const svc = cat.services.find((s) => s.id === serviceId);
    if (!svc) return send(res, 404, { error: 'SERVICE_NOT_FOUND', message: serviceId });

    if (!isVersion) return send(res, 200, { ...svc, compatible: compatible(svc, opts.deviceHw) });
    try {
      return send(res, 200, await resolveVersion(client, svc, rest[rest.length - 1]));
    } catch (e) {
      return send(res, 404, { error: 'VERSION_NOT_FOUND', message: (e as Error).message });
    }
  }

  if (resource === 'devices' || resource === 'jobs') {
    if (!p3) return send(res, 503, { error: 'OKTOPUS_NOT_CONFIGURED', message: 'set OKTOPUS_EMAIL + OKTOPUS_PASSWORD (or OKTOPUS_TOKEN)' });
    return handlePhase3(req, res, url, method, resource, rest, p3, session);
  }

  return send(res, 404, { error: 'NOT_FOUND' });
}

async function handlePhase3(req: IncomingMessage, res: ServerResponse, url: URL, method: string, resource: string, rest: string[], p3: Phase3, session: Session | null) {
  if (resource === 'jobs' && method === 'GET') {
    if (rest.length === 0) {
      const p = url.searchParams;
      return send(res, 200, p3.jobs.list({ device: session?.sn ?? p.get('device') ?? undefined, service: p.get('service') ?? undefined, state: p.get('state') ?? undefined }));
    }
    const job = rest.length === 1 ? p3.jobs.get(rest[0]) : undefined;
    return job && (!session || job.deviceSn === session.sn) ? send(res, 200, job) : send(res, 404, { error: 'JOB_NOT_FOUND', message: rest.join('/') });
  }

  if (resource === 'devices') {
    if (session && method === 'GET' && rest.length === 0) {
      const d = await p3.registry.get(session.sn);
      return send(res, 200, d ? [summary(d)] : []);
    }
    if (session && rest[0] && rest[0] !== session.sn) {
      return send(res, 403, { error: 'WRONG_DEVICE', message: `Signed in for ${session.sn}; sign out to manage another device.` });
    }
    if (method === 'GET' && rest.length === 0) {
      const online = url.searchParams.get('online');
      const q = url.searchParams.get('q')?.toLowerCase();
      const list = (await p3.registry.list(url.searchParams.get('refresh') === 'true'))
        .filter((d) => online === null || String(d.online) === online)
        .filter((d) => !q || d.sn.toLowerCase().includes(q) || d.model.toLowerCase().includes(q))
        .map(summary);
      return send(res, 200, list);
    }
    const sn = rest[0];
    if (sn && method === 'GET' && rest.length === 1) {
      const d = await p3.registry.get(sn);
      return d ? send(res, 200, summary(d)) : send(res, 404, { error: 'DEVICE_NOT_FOUND', message: sn });
    }
    if (sn && method === 'GET' && rest[1] === 'apps' && rest.length === 2) {
      const d = await p3.registry.get(sn);
      if (!d) return send(res, 404, { error: 'DEVICE_NOT_FOUND', message: sn });
      if (!d.online) return send(res, 409, { error: 'DEVICE_OFFLINE', message: `${sn} is not connected to Oktopus` });
      return send(res, 200, await p3.registry.apps(d));
    }
    if (sn && method === 'POST' && rest[1] === 'jobs' && rest.length === 2) {
      const body = (await readJson(req)) as JobRequest;
      if (session) body.requestedBy = `${session.sn} @ ${session.ip}`;
      const job = await p3.jobs.create(sn, body);
      return send(res, 202, job);
    }
  }
  return send(res, 404, { error: 'NOT_FOUND' });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

/** Static files of the built dashboard; unknown paths get index.html (client-side routes). */
async function serveStatic(res: ServerResponse, dir: string, urlPath: string) {
  const root = resolve(dir);
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = resolve(join(root, normalize(rel)));
  if (file !== root && !file.startsWith(root + sep)) return send(res, 403, { error: 'FORBIDDEN' });
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
  } catch {
    file = join(root, 'index.html');
  }
  try {
    const data = await readFile(file);
    const html = file.endsWith('.html');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': html ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    send(res, 404, { error: 'NOT_FOUND', message: 'dashboard not built (no index.html in the public folder)' });
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new JobError(413, 'BODY_TOO_LARGE', 'request body over 64 KiB');
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new JobError(400, 'BAD_JSON', 'request body is not valid JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}
