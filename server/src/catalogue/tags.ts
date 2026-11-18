// Release tags: vMAJOR.MINOR.PATCH, optional pre-release suffix (-rc1, -beta.2).
// Highest release is offered by default; pre-releases only when enabled (design §4.1).

export interface SemVer {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  pre: string | null;
}

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseTag(name: string): SemVer | null {
  const m = TAG_RE.exec(name);
  if (!m) return null;
  return { raw: name, major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? null };
}

export function compareSemver(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;      // release > pre-release
  if (b.pre === null) return -1;
  const pa = a.pre.split('.');
  const pb = b.pre.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) { const d = Number(x) - Number(y); if (d !== 0) return d; continue; }
    if (nx) return -1;
    if (ny) return 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Release tags newest first; non-semver tags (latest, dev, sha) are dropped. */
export function sortReleases(tags: string[], includePre: boolean): string[] {
  return tags
    .map(parseTag)
    .filter((v): v is SemVer => v !== null && (includePre || v.pre === null))
    .sort((a, b) => compareSemver(b, a))
    .map((v) => v.raw);
}

export function pickLatest(tags: string[], includePre: boolean): string | null {
  return sortReleases(tags, includePre)[0] ?? null;
}
