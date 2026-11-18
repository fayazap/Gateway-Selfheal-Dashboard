// Sign-in with the device serial number (+ optional access code).
// A serial number is printed on the device and visible in the ACS, so it is an identifier, not a secret:
// set LCM_ACCESS_CODE when the dashboard is reachable by people who should not control the modem.
//   - the device must exist in Oktopus and be online (connected to the ACS)
//   - LCM_ALLOWED_SNS limits which serials may sign in (empty = any device in the Oktopus organization)
//   - failed attempts are rate-limited per client address
//   - the session is an opaque random token in an HttpOnly, SameSite=Strict cookie; every device/job
//     request is limited to the session's device

import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Session { token: string; sn: string; createdAt: number; lastSeen: number; ip: string }

export interface AuthOptions {
  accessCode?: string;            // required in addition to the serial when set
  allowedSns?: string[];          // empty/undefined = any device in Oktopus
  sessionHours?: number;          // absolute lifetime
  idleMinutes?: number;           // sign out after this long without requests
  maxFailures?: number;           // per client within the window
  failureWindowMs?: number;
  now?: () => number;
}

export const COOKIE = 'lcm_session';
const SERIAL_RE = /^[A-Za-z0-9._-]{3,64}$/;

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class Auth {
  private sessions = new Map<string, Session>();
  private failures = new Map<string, number[]>();
  private o: Required<Omit<AuthOptions, 'accessCode' | 'allowedSns'>> & Pick<AuthOptions, 'accessCode' | 'allowedSns'>;

  constructor(opts: AuthOptions = {}) {
    this.o = { sessionHours: 12, idleMinutes: 120, maxFailures: 10, failureWindowMs: 5 * 60_000, now: Date.now, ...opts };
  }

  get codeRequired(): boolean {
    return Boolean(this.o.accessCode);
  }

  /** Checks rate limit, format, allowed list and access code. The ACS check is done by the caller. */
  precheck(ip: string, serial: unknown, code: unknown): string {
    const now = this.o.now();
    const recent = (this.failures.get(ip) ?? []).filter((t) => now - t < this.o.failureWindowMs);
    this.failures.set(ip, recent);
    if (recent.length >= this.o.maxFailures) {
      const wait = Math.ceil((this.o.failureWindowMs - (now - recent[0])) / 1000);
      throw new AuthError(429, 'TOO_MANY_ATTEMPTS', `Too many failed sign-ins. Try again in ${wait} s.`);
    }
    const sn = typeof serial === 'string' ? serial.trim() : '';
    if (!SERIAL_RE.test(sn)) throw this.fail(ip, 400, 'BAD_SERIAL', 'Enter the device serial number (letters, digits, . _ -).');
    if (this.o.accessCode) {
      const a = createHash('sha256').update(String(code ?? '')).digest();
      const b = createHash('sha256').update(this.o.accessCode).digest();
      if (!timingSafeEqual(a, b)) throw this.fail(ip, 401, 'BAD_CODE', 'Serial number or access code is not correct.');
    }
    if (this.o.allowedSns?.length && !this.o.allowedSns.some((s) => s.toLowerCase() === sn.toLowerCase())) {
      throw this.fail(ip, 401, 'NOT_CONNECTED', 'This device is not connected to the ACS.');
    }
    return sn;
  }

  fail(ip: string, status: number, code: string, message: string): AuthError {
    this.failures.set(ip, [...(this.failures.get(ip) ?? []), this.o.now()]);
    return new AuthError(status, code, message);
  }

  create(sn: string, ip: string): Session {
    this.failures.delete(ip);
    const now = this.o.now();
    const s: Session = { token: randomBytes(32).toString('base64url'), sn, createdAt: now, lastSeen: now, ip };
    this.sessions.set(s.token, s);
    return s;
  }

  /** Valid session for this request (and refreshes its idle timer), or null. */
  get(req: IncomingMessage): Session | null {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    const now = this.o.now();
    if (now - s.createdAt > this.o.sessionHours * 3_600_000 || now - s.lastSeen > this.o.idleMinutes * 60_000) {
      this.sessions.delete(token);
      return null;
    }
    s.lastSeen = now;
    return s;
  }

  destroy(req: IncomingMessage): void {
    const token = readCookie(req, COOKIE);
    if (token) this.sessions.delete(token);
  }

  cookie(s: Session | null): string {
    const base = `${COOKIE}=${s ? s.token : ''}; Path=/; HttpOnly; SameSite=Strict`;
    return s ? `${base}; Max-Age=${this.o.sessionHours * 3600}` : `${base}; Max-Age=0`;
  }
}

export function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

export function setCookie(res: ServerResponse, value: string): void {
  res.setHeader('Set-Cookie', value);
}
