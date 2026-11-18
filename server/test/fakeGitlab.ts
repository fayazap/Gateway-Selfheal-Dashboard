// In-memory GitLab API used by the tests. Supports X-Next-Page pagination with per_page.

import type { FetchLike } from '../src/gitlab/client.ts';

export interface FakeProject {
  id: number;
  path: string;
  name: string;
  description: string | null;
  repos?: { id: number; path: string; tags: { name: string; digest: string; size: number }[] }[];
}

export function fakeGitlab(group: string, projects: FakeProject[]): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  const page = <T>(items: T[], u: URL) => {
    const per = Number(u.searchParams.get('per_page') ?? '20');
    const p = Number(u.searchParams.get('page') ?? '1');
    const slice = items.slice((p - 1) * per, p * per);
    const hasMore = p * per < items.length;
    return reply(200, slice, { 'x-next-page': hasMore ? String(p + 1) : '' });
  };

  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v4/, '');
    let m: RegExpExecArray | null;
    if ((m = /^\/groups\/([^/]+)\/projects$/.exec(path))) {
      if (decodeURIComponent(m[1]) !== group) return reply(404, { message: '404 Group Not Found' });
      return page(projects.map((p) => ({
        id: p.id, name: p.name, path_with_namespace: p.path, description: p.description,
        avatar_url: null, web_url: `https://gitlab.example/${p.path}`, last_activity_at: '2026-10-20T00:00:00Z',
      })), u);
    }
    if ((m = /^\/projects\/(\d+)\/registry\/repositories$/.exec(path))) {
      const p = projects.find((x) => x.id === Number(m![1]));
      if (!p) return reply(404, {});
      return page((p.repos ?? []).map((r) => ({ id: r.id, name: '', path: r.path, location: `registry.example/${r.path}` })), u);
    }
    if ((m = /^\/projects\/(\d+)\/registry\/repositories\/(\d+)\/tags$/.exec(path))) {
      const r = projects.find((x) => x.id === Number(m![1]))?.repos?.find((x) => x.id === Number(m![2]));
      if (!r) return reply(404, {});
      return page(r.tags.map((t) => ({ name: t.name, path: `${r.path}:${t.name}`, location: `registry.example/${r.path}:${t.name}` })), u);
    }
    if ((m = /^\/projects\/(\d+)\/registry\/repositories\/(\d+)\/tags\/([^/]+)$/.exec(path))) {
      const r = projects.find((x) => x.id === Number(m![1]))?.repos?.find((x) => x.id === Number(m![2]));
      const t = r?.tags.find((x) => x.name === decodeURIComponent(m![3]));
      if (!r || !t) return reply(404, { message: '404 Tag Not Found' });
      return reply(200, {
        name: t.name, path: `${r.path}:${t.name}`, location: `registry.example/${r.path}:${t.name}`,
        digest: t.digest, total_size: t.size, created_at: '2026-10-21T00:00:00Z',
      });
    }
    return reply(404, { message: `unhandled ${path}` });
  };
  return { fetch, calls };
}

export const SAMPLE: FakeProject[] = [
  {
    id: 1, path: 'tinno-lcm/security-plus', name: 'security-plus',
    description: 'Threat detection and DPI. [lcm name=Security Plus; tier=Business; category=security; network=shared; ram=64; disk=120; hw=wan]',
    repos: [{ id: 11, path: 'tinno-lcm/security-plus', tags: [
      { name: 'v2.0.0', digest: 'sha256:aaa', size: 50 * 1048576 },
      { name: 'v2.1.0', digest: 'sha256:bbb', size: 52 * 1048576 },
      { name: 'latest', digest: 'sha256:bbb', size: 52 * 1048576 },
    ] }],
  },
  {
    id: 2, path: 'tinno-lcm/wan-monitor', name: 'wan-monitor',
    description: 'Upstream reachability telemetry. [lcm name=WAN monitor; tier=All; category=docsis]',
    repos: [
      { id: 21, path: 'tinno-lcm/wan-monitor/builder', tags: [{ name: 'v1.0.0', digest: 'sha256:xxx', size: 1 }] },
      { id: 22, path: 'tinno-lcm/wan-monitor', tags: [{ name: 'v1.4.2', digest: 'sha256:ccc', size: 9 * 1048576 }] },
    ],
  },
  { id: 3, path: 'tinno-lcm/notes', name: 'notes', description: 'Team notes, not a service', repos: [] },
  {
    id: 4, path: 'tinno-lcm/no-image', name: 'no-image',
    description: '[lcm tier=Basic; category=ai]', repos: [],
  },
  {
    id: 5, path: 'tinno-lcm/no-release', name: 'no-release',
    description: '[lcm tier=Basic; category=ai]',
    repos: [{ id: 51, path: 'tinno-lcm/no-release', tags: [{ name: 'latest', digest: 'sha256:d', size: 1 }] }],
  },
];
