import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDescription } from '../src/catalogue/parseDescription.ts';

const TIERS = ['Basic', 'Advanced', 'Business'];

test('design-doc example: Security Plus', () => {
  const r = parseDescription(
    'Threat detection, DPI and anomaly monitoring on WAN and LAN interfaces. [lcm name=Security Plus; tier=Business; category=security; network=shared; hostproc=true; ram=64; disk=120; hw=wan; health=exec:/usr/bin/healthcheck]',
    TIERS,
  );
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.text, 'Threat detection, DPI and anomaly monitoring on WAN and LAN interfaces.');
  assert.deepEqual(r.meta, {
    name: 'Security Plus', tier: 'Business', category: 'security', segments: null,
    network: 'shared', hostproc: true, privileged: false, ramMB: 64, diskMB: 120,
    hw: ['wan'], docsis: null, health: { type: 'exec', cmd: '/usr/bin/healthcheck' },
    graceS: 60, featured: false,
  });
});

test('defaults for a minimal block', () => {
  const r = parseDescription('WAN probe [lcm tier=All; category=docsis]', TIERS);
  assert.equal(r.ok, true);
  assert.equal(r.meta?.tier, 'All');
  assert.equal(r.meta?.network, 'bridged');
  assert.equal(r.meta?.ramMB, 32);
  assert.equal(r.meta?.diskMB, null);
  assert.deepEqual(r.meta?.health, { type: 'none' });
  assert.equal(r.meta?.name, null);
});

test('http health check and case-insensitive tier', () => {
  const r = parseDescription('[lcm tier=advanced; category=AI; health=http:8080/health; segment=smb,Enterprise]', TIERS);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.meta?.tier, 'Advanced');
  assert.equal(r.meta?.category, 'ai');
  assert.deepEqual(r.meta?.health, { type: 'http', port: 8080, path: '/health' });
  assert.deepEqual(r.meta?.segments, ['SMB', 'Enterprise']);
});

test('block may sit in the middle and spans spacing', () => {
  const r = parseDescription('Line one.\n[lcm  tier=Basic ;category=analytics ; ]\nLine two.', TIERS);
  assert.equal(r.ok, true);
  assert.equal(r.text, 'Line one. Line two.');
});

test('missing block is an error', () => {
  const r = parseDescription('Just a normal project', TIERS);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /no \[lcm/);
});

test('empty and null descriptions', () => {
  assert.equal(parseDescription(null, TIERS).ok, false);
  assert.equal(parseDescription('[lcm]', TIERS).ok, false);
});

test('missing required keys', () => {
  const r = parseDescription('[lcm name=X]', TIERS);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('"tier"')));
  assert.ok(r.errors.some((e) => e.includes('"category"')));
});

test('invalid values are collected, not just the first', () => {
  const r = parseDescription(
    '[lcm tier=Gold; category=games; network=host; ram=0; disk=-5; hw=bluetooth; docsis=3.0; privileged=yes; health=tcp:80; grace=abc]',
    TIERS,
  );
  assert.equal(r.ok, false);
  for (const k of ['tier', 'category', 'network', 'ram', 'disk', 'hw', 'docsis', 'privileged', 'health', 'grace']) {
    assert.ok(r.errors.some((e) => e.startsWith(k) || e.includes(`"${k}`) || e.includes(k)), `expected an error for ${k}: ${r.errors.join(' | ')}`);
  }
});

test('duplicate key and empty value are errors', () => {
  assert.equal(parseDescription('[lcm tier=Basic; tier=Business; category=ai]', TIERS).ok, false);
  assert.equal(parseDescription('[lcm tier=Basic; category=]', TIERS).ok, false);
});

test('malformed entry is an error', () => {
  const r = parseDescription('[lcm tier=Basic; category=ai; featured]', TIERS);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /malformed/);
});

test('unknown keys only warn', () => {
  const r = parseDescription('[lcm tier=Basic; category=ai; owner=noc]', TIERS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, ['unknown key "owner" ignored']);
});

test('custom tier list from config', () => {
  const r = parseDescription('[lcm tier=Gold; category=custom]', ['Silver', 'Gold']);
  assert.equal(r.ok, true);
  assert.equal(r.meta?.tier, 'Gold');
});

test('http port out of range', () => {
  assert.equal(parseDescription('[lcm tier=Basic; category=ai; health=http:70000/h]', TIERS).ok, false);
});
