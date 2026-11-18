// Minimal GitLab REST v4 client for the catalogue (design §4.2).
// Uses Node's global fetch; a fetch implementation can be injected for tests.

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  avatar_url: string | null;
  web_url: string;
  last_activity_at: string;
}

export interface RegistryRepository {
  id: number;
  name: string;
  path: string;        // e.g. "tinno-lcm/security-plus"
  location: string;    // e.g. "registry.gitlab.com/tinno-lcm/security-plus"
}

export interface RegistryTag {
  name: string;
  path: string;
  location: string;
}

export interface RegistryTagDetail extends RegistryTag {
  digest: string;      // "sha256:..."
  total_size: number;
  created_at: string;
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface GitLabClientOptions {
  baseUrl: string;             // e.g. "https://gitlab.com"
  token?: string;              // group access token, read_api (optional for public groups)
  fetchImpl?: FetchLike;
  perPage?: number;
}

export class GitLabError extends Error {
  status: number;
  url: string;
  constructor(status: number, url: string, body: string) {
    super(`GitLab ${status} for ${url}: ${body.slice(0, 200)}`);
    this.status = status;
    this.url = url;
  }
}

export class GitLabClient {
  private base: string;
  private token: string | undefined;
  private fetchImpl: FetchLike;
  private perPage: number;

  constructor(opts: GitLabClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '') + '/api/v4';
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.perPage = opts.perPage ?? 100;
  }

  listGroupProjects(group: string): Promise<GitLabProject[]> {
    return this.getAll<GitLabProject>(
      `/groups/${encodeURIComponent(group)}/projects?include_subgroups=true&archived=false&order_by=path&sort=asc`,
    );
  }

  listRepositories(projectId: number): Promise<RegistryRepository[]> {
    return this.getAll<RegistryRepository>(`/projects/${projectId}/registry/repositories`);
  }

  listTags(projectId: number, repositoryId: number): Promise<RegistryTag[]> {
    return this.getAll<RegistryTag>(`/projects/${projectId}/registry/repositories/${repositoryId}/tags`);
  }

  async getTag(projectId: number, repositoryId: number, tag: string): Promise<RegistryTagDetail> {
    const { body } = await this.get(
      `${this.base}/projects/${projectId}/registry/repositories/${repositoryId}/tags/${encodeURIComponent(tag)}`,
    );
    return body as RegistryTagDetail;
  }

  // Follows Link rel="next" (keyset, gitlab.com registry) or X-Next-Page (offset).
  private async getAll<T>(path: string): Promise<T[]> {
    const sep = path.includes('?') ? '&' : '?';
    let url: string | null = `${this.base}${path}${sep}per_page=${this.perPage}`;
    const out: T[] = [];
    let guard = 0;
    while (url) {
      if (++guard > 1000) throw new Error(`pagination did not terminate for ${path}`);
      const { body, headers } = await this.get(url);
      if (!Array.isArray(body)) throw new Error(`expected a list from ${url}`);
      out.push(...(body as T[]));
      url = nextUrl(url, headers);
    }
    return out;
  }

  private async get(url: string): Promise<{ body: unknown; headers: { get(n: string): string | null } }> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.token) headers['PRIVATE-TOKEN'] = this.token;
    const res = await this.fetchImpl(url, { headers });
    if (!res.ok) throw new GitLabError(res.status, url, await res.text().catch(() => ''));
    return { body: await res.json(), headers: res.headers };
  }
}

function nextUrl(current: string, headers: { get(n: string): string | null }): string | null {
  const link = headers.get('link');
  if (link) {
    for (const part of link.split(',')) {
      const m = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part);
      if (m) return m[1];
    }
  }
  const next = headers.get('x-next-page');
  if (next && next.trim() !== '') {
    const u = new URL(current);
    u.searchParams.set('page', next.trim());
    return u.toString();
  }
  return null;
}
