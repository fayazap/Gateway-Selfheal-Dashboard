import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitLabClient } from '../src/gitlab/client.ts';
import { buildCatalogue, resolveVersion, verifyPulledDigest } from '../src/catalogue/sync.ts';
import { fakeGitlab, SAMPLE } from './fakeGitlab.ts';

const opts = { group: 'tinno-lcm', tiers: ['Basic', 'Advanced', 'Business'], includePrerelease: false };

test('builds services and issues from a group', async () => {
  const gl = fakeGitlab('tinno-lcm', SAMPLE);
  const client = new GitLabClient({ baseUrl: 'https://gitlab.example', fetchImpl: gl.fetch, perPage: 2 });
  const cat = await buildCatalogue(client, opts);

  assert.deepEqual(cat.services.map((s) => s.id), ['tinno-lcm/security-plus', 'tinno-lcm/wan-monitor']);
  const sp = cat.services[0];
  assert.equal(sp.name, 'Security Plus');
  assert.equal(sp.latest, 'v2.1.0');
  assert.deepEqual(sp.versions, ['v2.1.0', 'v2.0.0']);
  assert.equal(sp.meta.network, 'shared');

  // root repository chosen over a sub-image
  assert.equal(cat.services[1].repository.id, 22);
  assert.equal(cat.services[1].latest, 'v1.4.2');

  const byPath = Object.fromEntries(cat.issues.map((i) => [i.path, i.errors.join(' ')]));
  assert.match(byPath['tinno-lcm/notes'], /no \[lcm/);
  assert.match(byPath['tinno-lcm/no-image'], /no container image/);
  assert.match(byPath['tinno-lcm/no-release'], /no release tags/);
});

test('pagination is followed (perPage=2 over 5 projects)', async () => {
  const gl = fakeGitlab('tinno-lcm', SAMPLE);
  const client = new GitLabClient({ baseUrl: 'https://gitlab.example', fetchImpl: gl.fetch, perPage: 2 });
  await buildCatalogue(client, opts);
  const groupCalls = gl.calls.filter((c) => c.includes('/groups/'));
  assert.equal(groupCalls.length, 3);
});

test('resolveVersion gives digest and both image URLs', async () => {
  const gl = fakeGitlab('tinno-lcm', SAMPLE);
  const client = new GitLabClient({ baseUrl: 'https://gitlab.example', fetchImpl: gl.fetch });
  const cat = await buildCatalogue(client, opts);
  const v = await resolveVersion(client, cat.services[0], 'v2.1.0');
  assert.equal(v.digest, 'sha256:bbb');
  assert.equal(v.imageUrl, 'docker://registry.example/tinno-lcm/security-plus:v2.1.0');
  assert.equal(v.expectedDigest, 'sha256:bbb');
  assert.equal(v.diskMB, 120);                       // from metadata

  const w = await resolveVersion(client, cat.services[1], 'v1.4.2');
  assert.equal(w.diskMB, 18);                        // no metadata -> 9 MB x 2

  await assert.rejects(resolveVersion(client, cat.services[0], 'latest'), /no release tag/);
});

test('unknown group surfaces a GitLab error', async () => {
  const gl = fakeGitlab('tinno-lcm', SAMPLE);
  const client = new GitLabClient({ baseUrl: 'https://gitlab.example', fetchImpl: gl.fetch });
  await assert.rejects(buildCatalogue(client, { ...opts, group: 'other' }), /GitLab 404/);
});

test('token is sent as PRIVATE-TOKEN', async () => {
  let seen: Record<string, string> | undefined;
  const gl = fakeGitlab('tinno-lcm', SAMPLE);
  const client = new GitLabClient({
    baseUrl: 'https://gitlab.example', token: 't0k',
    fetchImpl: (u, init) => { seen = init?.headers; return gl.fetch(u, init); },
  });
  await client.listGroupProjects('tinno-lcm');
  assert.equal(seen?.['PRIVATE-TOKEN'], 't0k');
});

// index.json as captured from the B521DE after installing tinno-ai-service:v25.0.0
const DEVICE_INDEX = {
  schemaVersion: 2,
  manifests: [{
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    size: 478,
    digest: 'sha256:efd5e82ba21be2ef56e3577f3abfb123311acf311a59dd3d5cc5e96e17b41a7e',
    annotations: {
      'org.opencontainers.image.ref.name': 'v25.0.0',
      'com.softathome.image.uri': 'docker://registry.gitlab.com/tinno-lcm/tinno-ai-service:v25.0.0',
      'com.softathome.image.duid': '7d72f7c6-13a2-5ac3-bb8c-66aeb27cc3ce',
      'com.softathome.image.markforremoval': '0',
    },
  }],
};

test('verifyPulledDigest against the real device index.json', () => {
  const good = 'sha256:efd5e82ba21be2ef56e3577f3abfb123311acf311a59dd3d5cc5e96e17b41a7e';
  assert.equal(verifyPulledDigest(DEVICE_INDEX, 'v25.0.0', good).ok, true);
  const bad = verifyPulledDigest(DEVICE_INDEX, 'v25.0.0', 'sha256:other');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /pulled sha256:efd5/);
  assert.match(verifyPulledDigest(DEVICE_INDEX, 'v26.0.0', good).reason, /no manifest for tag/);
  assert.equal(verifyPulledDigest({}, 'v25.0.0', good).ok, false);
});
