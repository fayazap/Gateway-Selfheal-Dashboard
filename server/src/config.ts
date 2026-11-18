// Configuration from environment variables (design §15.2).
// Secrets can also come from files (<NAME>_FILE), so they need not sit in the shell environment.

import { readFileSync } from 'node:fs';

type Env = Record<string, string | undefined>;

export interface OktopusConfig {
  url: string;
  email: string | undefined;
  password: string | undefined;
  token: string | undefined;
}

export interface Config {
  gitlabUrl: string;
  gitlabGroup: string;
  gitlabToken: string | undefined;
  tiers: string[];
  includePrerelease: boolean;
  refreshMinutes: number;
  port: number;
  dataDir: string;
  // Phase 3
  oktopus: OktopusConfig | null;         // null = device/job endpoints disabled
  deviceSn: string | undefined;          // single-device mode: the only device the dashboard manages
  deviceHw: string[] | undefined;        // hardware of that device (wan, wifi, moca) for compatibility
  publicDir: string;                     // built dashboard served by the backend
  host: string;                          // listen address; 127.0.0.1 = this PC only
  openBrowser: boolean;                  // open the dashboard in the browser at start (installer)
  portFallback: boolean;                 // try the next ports when PORT is reserved or taken (installer)
  auth: 'serial' | 'off';                // sign-in with the device serial number
  accessCode: string | undefined;        // optional code required together with the serial
  allowedSns: string[] | undefined;      // serials allowed to sign in (unset = any device in Oktopus)
  registryUsername: string | undefined;  // credentials the modem uses to pull images (GitLab deploy token)
  registryPassword: string | undefined;
  execEnvRef: string;
  retainData: boolean;                   // Update keeps the app's data (RetainData=true, needs usp-pa v10)
  pollSeconds: number;
  jobTimeoutMinutes: number;
}

/** Settings file (JSON object with the same names as the environment variables), used by the installer.
 *  Environment variables win over the file. */
export function withConfigFile(env: Env): Env {
  const file = env.LCM_CONFIG_FILE;
  if (!file) return env;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`cannot read settings file ${file}: ${(e as Error).message}`);
  }
  const merged: Env = {};
  for (const [k, v] of Object.entries(json)) if (v !== null && v !== undefined && v !== '') merged[k] = String(v);
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v !== '') merged[k] = v;
  return merged;
}

function list(v: string | undefined): string[] | undefined {
  return v === undefined ? undefined : v.split(',').map((s) => s.trim()).filter(Boolean);
}

function secret(env: Env, name: string): string | undefined {
  const file = env[`${name}_FILE`];
  if (file) return readFileSync(file, 'utf8').trim() || undefined;
  return env[name] || undefined;
}

export function loadConfig(rawEnv: Env = process.env): Config {
  const env = withConfigFile(rawEnv);
  const group = env.GITLAB_GROUP;
  if (!group) throw new Error('GITLAB_GROUP is required (the GitLab group holding the LCM container projects)');
  const email = env.OKTOPUS_EMAIL || undefined;
  const password = secret(env, 'OKTOPUS_PASSWORD');
  const token = secret(env, 'OKTOPUS_TOKEN');
  return {
    gitlabUrl: env.GITLAB_URL ?? 'https://gitlab.com',
    gitlabGroup: group,
    gitlabToken: secret(env, 'GITLAB_TOKEN'),
    tiers: (env.LCM_TIERS ?? 'Basic,Advanced,Business').split(',').map((s) => s.trim()).filter(Boolean),
    includePrerelease: (env.LCM_INCLUDE_PRERELEASE ?? 'false').toLowerCase() === 'true',
    refreshMinutes: Number(env.LCM_REFRESH_MINUTES ?? '15'),
    port: Number(env.PORT ?? '8080'),
    dataDir: env.LCM_DATA_DIR ?? './data',
    oktopus: (email && password) || token
      ? { url: env.OKTOPUS_URL ?? 'https://tinno.oktopus.app.br', email, password, token }
      : null,
    deviceSn: env.LCM_DEVICE_SN || undefined,
    deviceHw: env.LCM_DEVICE_HW !== undefined ? env.LCM_DEVICE_HW.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    publicDir: env.LCM_PUBLIC_DIR ?? './public',
    host: env.LCM_HOST ?? '127.0.0.1',
    openBrowser: (env.LCM_OPEN_BROWSER ?? 'false').toLowerCase() === 'true',
    portFallback: (env.LCM_PORT_FALLBACK ?? 'false').toLowerCase() === 'true',
    auth: (env.LCM_AUTH ?? 'serial').toLowerCase() === 'off' ? 'off' : 'serial',
    accessCode: secret(env, 'LCM_ACCESS_CODE'),
    allowedSns: list(env.LCM_ALLOWED_SNS) ?? (env.LCM_DEVICE_SN ? [env.LCM_DEVICE_SN] : undefined),
    registryUsername: env.REGISTRY_USERNAME || undefined,
    registryPassword: secret(env, 'REGISTRY_PASSWORD'),
    execEnvRef: env.LCM_EXEC_ENV_REF ?? 'Device.SoftwareModules.ExecEnv.1.',
    retainData: (env.LCM_UPDATE_RETAIN_DATA ?? 'true').toLowerCase() !== 'false',
    pollSeconds: Number(env.LCM_POLL_SECONDS ?? '10'),
    jobTimeoutMinutes: Number(env.LCM_JOB_TIMEOUT_MINUTES ?? '16'),
  };
}
