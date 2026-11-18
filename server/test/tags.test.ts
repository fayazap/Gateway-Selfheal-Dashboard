import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTag, pickLatest, sortReleases } from '../src/catalogue/tags.ts';

test('parses release and pre-release tags', () => {
  assert.deepEqual(parseTag('v2.1.0'), { raw: 'v2.1.0', major: 2, minor: 1, patch: 0, pre: null });
  assert.equal(parseTag('v2.1.0-rc1')?.pre, 'rc1');
  assert.equal(parseTag('latest'), null);
  assert.equal(parseTag('2.1.0'), null);
  assert.equal(parseTag('v24.0'), null);
});

test('numeric ordering, not string ordering', () => {
  assert.deepEqual(sortReleases(['v1.9.0', 'v1.10.0', 'v1.2.3'], false), ['v1.10.0', 'v1.9.0', 'v1.2.3']);
});

test('pre-releases hidden unless enabled, and rank below the release', () => {
  const tags = ['v2.0.0-rc1', 'v1.5.0', 'latest', 'v2.0.0-rc2', 'v2.0.0', 'v2.1.0-beta.10', 'v2.1.0-beta.2'];
  assert.equal(pickLatest(tags, false), 'v2.0.0');
  assert.deepEqual(sortReleases(tags, true), ['v2.1.0-beta.10', 'v2.1.0-beta.2', 'v2.0.0', 'v2.0.0-rc2', 'v2.0.0-rc1', 'v1.5.0']);
});

test('no releases', () => {
  assert.equal(pickLatest(['latest', 'dev'], false), null);
});
