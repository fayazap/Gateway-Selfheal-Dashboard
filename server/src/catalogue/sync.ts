// Builds the App Store catalogue from a GitLab group (design §4).
//   project            -> service (id = path_with_namespace)
//   description        -> [lcm ...] metadata (parseDescription)
//   root registry repo -> image; semver tags -> versions
// Projects that fail are not dropped silently: they go to `issues` with the reason.

import type { GitLabClient, GitLabProject, RegistryRepository, RegistryTagDetail } from '../gitlab/client.ts';
import { parseDescription } from './parseDescription.ts';
import type { LcmMeta } from './parseDescription.ts';
import { sortReleases } from './tags.ts';

export interface Service {
  id: string;                  // GitLab path_with_namespace, stable service ID
  projectId: number;
  name: string;
  description: string;
  avatarUrl: string | null;
  webUrl: string;
  meta: LcmMeta;
  warnings: string[];
  repository: { id: number; location: string };
  versions: string[];          // newest first
  latest: string;
  lastActivityAt: string;
}

export interface CatalogueIssue {
  projectId: number;
  path: string;
  webUrl: string;
  errors: string[];
  warnings: string[];
}

export interface Catalogue {
  group: string;
  builtAt: string;
  services: Service[];
  issues: CatalogueIssue[];
}

export interface BuildOptions {
  group: string;
  tiers: string[];
  includePrerelease: boolean;
  concurrency?: number;
  now?: () => Date;
}

export async function buildCatalogue(client: GitLabClient, opts: BuildOptions): Promise<Catalogue> {
  const projects = await client.listGroupProjects(opts.group);
  const results = await mapLimit(projects, opts.concurrency ?? 4, (p) => buildOne(client, p, opts));
  const services: Service[] = [];
  const issues: CatalogueIssue[] = [];
  for (const r of results) {
    if ('issue' in r) issues.push(r.issue);
    else services.push(r.service);
  }
  services.sort((a, b) => a.name.localeCompare(b.name));
  return {
    group: opts.group,
    builtAt: (opts.now ?? (() => new Date()))().toISOString(),
    services,
    issues,
  };
}

async function buildOne(
  client: GitLabClient, p: GitLabProject, opts: BuildOptions,
): Promise<{ service: Service } | { issue: CatalogueIssue }> {
  const issue = (errors: string[], warnings: string[] = []) => ({
    issue: { projectId: p.id, path: p.path_with_namespace, webUrl: p.web_url, errors, warnings },
  });

  const parsed = parseDescription(p.description, opts.tiers);
  if (!parsed.ok || !parsed.meta) return issue(parsed.errors, parsed.warnings);

  let repos: RegistryRepository[];
  try {
    repos = await client.listRepositories(p.id);
  } catch (e) {
    return issue([`cannot list container registry: ${(e as Error).message}`], parsed.warnings);
  }
  const repo = pickRootRepository(p, repos);
  if (!repo) {
    return issue(
      [repos.length === 0
        ? 'no container image in the project registry'
        : `no image at the project root path (${p.path_with_namespace}); found: ${repos.map((r) => r.path).join(', ')}`],
      parsed.warnings,
    );
  }

  let tagNames: string[];
  try {
    tagNames = (await client.listTags(p.id, repo.id)).map((t) => t.name);
  } catch (e) {
    return issue([`cannot list image tags: ${(e as Error).message}`], parsed.warnings);
  }
  const versions = sortReleases(tagNames, opts.includePrerelease);
  if (versions.length === 0) {
    return issue([`no release tags (vMAJOR.MINOR.PATCH); tags found: ${tagNames.join(', ') || 'none'}`], parsed.warnings);
  }

  return {
    service: {
      id: p.path_with_namespace,
      projectId: p.id,
      name: parsed.meta.name ?? p.name,
      description: parsed.text,
      avatarUrl: p.avatar_url,
      webUrl: p.web_url,
      meta: parsed.meta,
      warnings: parsed.warnings,
      repository: { id: repo.id, location: repo.location },
      versions,
      latest: versions[0],
      lastActivityAt: p.last_activity_at,
    },
  };
}

/** The image whose path equals the project path; a lone repository is accepted too. */
export function pickRootRepository(p: GitLabProject, repos: RegistryRepository[]): RegistryRepository | null {
  const root = repos.find((r) => r.path === p.path_with_namespace);
  if (root) return root;
  return repos.length === 1 ? repos[0] : null;
}

export interface ResolvedVersion {
  serviceId: string;
  tag: string;
  digest: string;
  sizeBytes: number;
  createdAt: string;
  imageUrl: string;            // what the modem gets: docker://registry/...:tag
                               // (rlyeh v2.4.0 cannot pull @sha256 references — OI-3, tested on B521DE)
  expectedDigest: string;      // compare with the digest rlyeh actually pulled (verifyPulledDigest)
  diskMB: number;              // metadata disk, or registry size x2
}

/** Resolve a tag to its digest just before install (design §4.3 / §4.4). */
export async function resolveVersion(client: GitLabClient, s: Service, tag: string): Promise<ResolvedVersion> {
  if (!s.versions.includes(tag)) throw new Error(`${s.id} has no release tag ${tag}`);
  const d: RegistryTagDetail = await client.getTag(s.projectId, s.repository.id, tag);
  const sizeMB = Math.ceil((d.total_size ?? 0) / (1024 * 1024));
  return {
    serviceId: s.id,
    tag,
    digest: d.digest,
    sizeBytes: d.total_size,
    createdAt: d.created_at,
    imageUrl: `docker://${s.repository.location}:${tag}`,
    expectedDigest: d.digest,
    diskMB: s.meta.diskMB ?? Math.max(1, sizeMB * 2),
  };
}

export interface DigestCheck {
  ok: boolean;
  pulledDigest: string | null;
  expectedDigest: string;
  reason: string;
}

/**
 * Checks rlyeh's index.json (/lcm/rlyeh/images/<project path>/index.json on the modem)
 * against the digest GitLab reported. Matches the manifest whose ref.name is the tag.
 * A mismatch means the tag was re-pushed between resolve and pull (DIGEST_MISMATCH).
 */
export function verifyPulledDigest(indexJson: unknown, tag: string, expectedDigest: string): DigestCheck {
  const manifests = (indexJson as { manifests?: { digest?: string; annotations?: Record<string, string> }[] })?.manifests;
  if (!Array.isArray(manifests)) {
    return { ok: false, pulledDigest: null, expectedDigest, reason: 'index.json has no manifests list' };
  }
  const m = manifests.find((x) => x.annotations?.['org.opencontainers.image.ref.name'] === tag);
  if (!m || !m.digest) {
    return { ok: false, pulledDigest: null, expectedDigest, reason: `no manifest for tag ${tag} in index.json` };
  }
  return m.digest === expectedDigest
    ? { ok: true, pulledDigest: m.digest, expectedDigest, reason: 'digest matches' }
    : { ok: false, pulledDigest: m.digest, expectedDigest, reason: `pulled ${m.digest}, expected ${expectedDigest}` };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
