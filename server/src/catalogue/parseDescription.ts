// Parses the LCM metadata block from a GitLab project description.
//
//   <human description> [lcm key=value; key=value; ...]
//
// Rules are the ones in the design doc §5.2 / §5.3:
//   - first "[lcm ...]" block wins; the rest of the text is the card description
//   - missing block, missing required key, bad value, duplicate key  -> error (project rejected)
//   - unknown key                                                    -> warning (ignored)
// Limitation: values cannot contain ';' or ']' (keeps the format one-line and simple).

export type NetworkMode = 'bridged' | 'shared' | 'none';

export type HealthCheck =
  | { type: 'none' }
  | { type: 'exec'; cmd: string }
  | { type: 'http'; port: number; path: string };

export interface LcmMeta {
  name: string | null;          // null = use GitLab project name
  tier: string;                 // 'All' or a canonical tier name from the tier list
  category: string;
  segments: string[] | null;    // null = all segments
  network: NetworkMode;
  hostproc: boolean;
  privileged: boolean;
  ramMB: number;
  diskMB: number | null;        // null = derive from registry size (x2)
  hw: string[];
  docsis: string[] | null;      // null = any
  health: HealthCheck;
  graceS: number;
  featured: boolean;
}

export interface ParseResult {
  ok: boolean;
  meta: LcmMeta | null;
  text: string;                 // description with the [lcm ...] block removed
  errors: string[];
  warnings: string[];
}

export const CATEGORIES = ['ai', 'security', 'docsis', 'analytics', 'custom'];
export const SEGMENTS = ['Residential', 'SMB', 'Enterprise'];
export const HW = ['wan', 'wifi', 'moca'];
export const DOCSIS = ['3.1', '4.0'];
const KNOWN_KEYS = [
  'name', 'tier', 'category', 'segment', 'network', 'hostproc', 'privileged',
  'ram', 'disk', 'hw', 'docsis', 'health', 'grace', 'featured',
];
const BLOCK_RE = /\[lcm(?:\s+([^\]]*))?\]/i;

export function parseDescription(
  description: string | null | undefined,
  tiers: string[],
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const src = description ?? '';
  const m = BLOCK_RE.exec(src);
  if (!m) {
    return {
      ok: false, meta: null, text: collapse(src),
      errors: ['no [lcm ...] metadata block in the project description'], warnings,
    };
  }
  const text = collapse(src.slice(0, m.index) + ' ' + src.slice(m.index + m[0].length));

  // key=value pairs
  const kv = new Map<string, string>();
  for (const raw of (m[1] ?? '').split(';')) {
    const part = raw.trim();
    if (part === '') continue;
    const eq = part.indexOf('=');
    if (eq <= 0) { errors.push(`malformed entry "${part}" (expected key=value)`); continue; }
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (!KNOWN_KEYS.includes(key)) { warnings.push(`unknown key "${key}" ignored`); continue; }
    if (kv.has(key)) { errors.push(`duplicate key "${key}"`); continue; }
    if (value === '') { errors.push(`empty value for "${key}"`); continue; }
    kv.set(key, value);
  }

  // required
  const tierRaw = kv.get('tier');
  let tier = '';
  if (tierRaw === undefined) errors.push('missing required key "tier"');
  else if (tierRaw.toLowerCase() === 'all') tier = 'All';
  else {
    const found = tiers.find((t) => t.toLowerCase() === tierRaw.toLowerCase());
    if (found) tier = found;
    else errors.push(`tier "${tierRaw}" is not "All" or one of: ${tiers.join(', ')}`);
  }

  const categoryRaw = kv.get('category');
  let category = '';
  if (categoryRaw === undefined) errors.push('missing required key "category"');
  else if (CATEGORIES.includes(categoryRaw.toLowerCase())) category = categoryRaw.toLowerCase();
  else errors.push(`category "${categoryRaw}" must be one of: ${CATEGORIES.join(', ')}`);

  // optional
  const segments = listOf(kv.get('segment'), SEGMENTS, 'segment', errors, true);
  const hw = listOf(kv.get('hw'), HW, 'hw', errors, false) ?? [];
  const docsis = listOf(kv.get('docsis'), DOCSIS, 'docsis', errors, false);

  const networkRaw = (kv.get('network') ?? 'bridged').toLowerCase();
  let network: NetworkMode = 'bridged';
  if (networkRaw === 'bridged' || networkRaw === 'shared' || networkRaw === 'none') network = networkRaw;
  else errors.push(`network "${networkRaw}" must be bridged, shared or none`);

  const hostproc = bool(kv.get('hostproc'), false, 'hostproc', errors);
  const privileged = bool(kv.get('privileged'), false, 'privileged', errors);
  const featured = bool(kv.get('featured'), false, 'featured', errors);
  const ramMB = posInt(kv.get('ram'), 32, 'ram', errors) as number;
  const diskMB = posInt(kv.get('disk'), null, 'disk', errors);
  const graceS = posInt(kv.get('grace'), 60, 'grace', errors) as number;
  const health = parseHealth(kv.get('health'), errors);

  if (errors.length > 0) return { ok: false, meta: null, text, errors, warnings };
  return {
    ok: true,
    meta: {
      name: kv.get('name') ?? null, tier, category, segments, network, hostproc,
      privileged, ramMB, diskMB, hw, docsis, health, graceS, featured,
    },
    text, errors, warnings,
  };
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function listOf(
  raw: string | undefined, allowed: string[], key: string, errors: string[], caseInsensitive: boolean,
): string[] | null {
  if (raw === undefined) return null;
  const out: string[] = [];
  for (const item of raw.split(',').map((s) => s.trim()).filter((s) => s !== '')) {
    const hit = allowed.find((a) => (caseInsensitive ? a.toLowerCase() === item.toLowerCase() : a === item.toLowerCase() || a === item));
    if (!hit) errors.push(`${key} "${item}" must be one of: ${allowed.join(', ')}`);
    else if (!out.includes(hit)) out.push(hit);
  }
  return out;
}

function bool(raw: string | undefined, dflt: boolean, key: string, errors: string[]): boolean {
  if (raw === undefined) return dflt;
  const v = raw.toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  errors.push(`${key} "${raw}" must be true or false`);
  return dflt;
}

function posInt(raw: string | undefined, dflt: number | null, key: string, errors: string[]): number | null {
  if (raw === undefined) return dflt;
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    errors.push(`${key} "${raw}" must be a positive whole number`);
    return dflt;
  }
  return Number(raw);
}

function parseHealth(raw: string | undefined, errors: string[]): HealthCheck {
  if (raw === undefined || raw.toLowerCase() === 'none') return { type: 'none' };
  if (raw.toLowerCase().startsWith('exec:')) {
    const cmd = raw.slice(5).trim();
    if (cmd === '') { errors.push('health exec: needs a command'); return { type: 'none' }; }
    return { type: 'exec', cmd };
  }
  const h = /^http:(\d{1,5})(\/\S*)$/i.exec(raw);
  if (h) {
    const port = Number(h[1]);
    if (port >= 1 && port <= 65535) return { type: 'http', port, path: h[2] };
  }
  errors.push(`health "${raw}" must be none, exec:<cmd> or http:<port></path>`);
  return { type: 'none' };
}
