import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkDomain } from './domain-filter.js';

const noFilter = { domainAllowlist: [], domainBlocklist: [] };

describe('checkDomain', () => {
  test('allows when no lists set', () => {
    const result = checkDomain('https://example.com', noFilter);
    assert.equal(result.blocked, false);
  });

  test('blocks hostname on blocklist', () => {
    const result = checkDomain('https://evil.com/page', { domainAllowlist: [], domainBlocklist: ['evil.com'] });
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('blocklist'));
  });

  test('blocks subdomain on blocklist', () => {
    const result = checkDomain('https://sub.evil.com', { domainAllowlist: [], domainBlocklist: ['evil.com'] });
    assert.equal(result.blocked, true);
  });

  test('allows hostname not on blocklist', () => {
    const result = checkDomain('https://good.com', { domainAllowlist: [], domainBlocklist: ['evil.com'] });
    assert.equal(result.blocked, false);
  });

  test('allows hostname on allowlist', () => {
    const result = checkDomain('https://allowed.com', { domainAllowlist: ['allowed.com'], domainBlocklist: [] });
    assert.equal(result.blocked, false);
  });

  test('blocks hostname not on allowlist when allowlist is set', () => {
    const result = checkDomain('https://other.com', { domainAllowlist: ['allowed.com'], domainBlocklist: [] });
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('allowlist'));
  });

  test('invalid URL returns blocked', () => {
    const result = checkDomain('not-a-url', noFilter);
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('Invalid URL'));
  });

  test('empty lists behave as no restriction', () => {
    const result = checkDomain('https://anything.com', noFilter);
    assert.equal(result.blocked, false);
  });

  test('blocks file:// protocol (SSRF)', () => {
    const result = checkDomain('file:///etc/passwd', noFilter);
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('Blocked protocol'));
  });

  test('blocks data: protocol (SSRF)', () => {
    const result = checkDomain('data:text/html,<h1>hi</h1>', noFilter);
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('Blocked protocol'));
  });

  test('blocks javascript: URLs (invalid URL)', () => {
    const result = checkDomain('javascript:alert(1)', noFilter);
    assert.equal(result.blocked, true);
  });

  test('blocks ftp:// protocol', () => {
    const result = checkDomain('ftp://example.com/file', noFilter);
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('Blocked protocol'));
  });

  test('allows http:// protocol', () => {
    const result = checkDomain('http://example.com', noFilter);
    assert.equal(result.blocked, false);
  });

  test('allows https:// protocol', () => {
    const result = checkDomain('https://example.com', noFilter);
    assert.equal(result.blocked, false);
  });
});

describe('SSRF private/reserved IP blocking', () => {
  test('blocks localhost', () => {
    const result = checkDomain('http://localhost/admin', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks 127.0.0.1', () => {
    const result = checkDomain('http://127.0.0.1/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks 169.254.169.254 (AWS metadata)', () => {
    const result = checkDomain('http://169.254.169.254/latest/meta-data/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks private 10.x', () => {
    const result = checkDomain('http://10.0.0.1/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks private 192.168.x', () => {
    const result = checkDomain('http://192.168.1.1/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks embedded credentials', () => {
    const result = checkDomain('http://user:pass@example.com/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks private 172.16.x', () => {
    const result = checkDomain('http://172.16.0.1/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('allows public 172.15.x (not in private range)', () => {
    const result = checkDomain('http://172.15.0.1/', noFilter);
    assert.strictEqual(result.blocked, false);
  });

  test('blocks 0.0.0.0', () => {
    const result = checkDomain('http://0.0.0.0/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks shared address space 100.64.x', () => {
    const result = checkDomain('http://100.64.0.1/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('allows public 100.63.x (not in shared range)', () => {
    const result = checkDomain('http://100.63.0.1/', noFilter);
    assert.strictEqual(result.blocked, false);
  });

  // IPv6 SSRF bypass vectors
  test('blocks IPv6 loopback [::1]', () => {
    const result = checkDomain('http://[::1]/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks IPv6-mapped loopback [::ffff:127.0.0.1]', () => {
    const result = checkDomain('http://[::ffff:127.0.0.1]/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks IPv6-mapped AWS metadata [::ffff:169.254.169.254]', () => {
    const result = checkDomain('http://[::ffff:169.254.169.254]/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks IPv6-mapped hex form [::ffff:7f00:1]', () => {
    const result = checkDomain('http://[::ffff:7f00:1]/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks IPv6 ULA fc00::/7', () => {
    const result = checkDomain('http://[fc00::1]/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks IPv6 ULA fd prefix', () => {
    const result = checkDomain('http://[fd12::1]/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks IPv6 link-local fe80::/10', () => {
    const result = checkDomain('http://[fe80::1]/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks decimal IP encoding (2130706433 = 127.0.0.1)', () => {
    const result = checkDomain('http://2130706433/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks decimal IP encoding (2852039166 = 169.254.169.254)', () => {
    const result = checkDomain('http://2852039166/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks hex IP encoding (0x7f000001 = 127.0.0.1)', () => {
    const result = checkDomain('http://0x7f000001/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('blocks octal IP encoding (0177.0.0.1 = 127.0.0.1)', () => {
    const result = checkDomain('http://0177.0.0.1/', noFilter);
    assert.strictEqual(result.blocked, true);
  });

  test('allows public IPv6 address', () => {
    const result = checkDomain('http://[2607:f8b0:4004:800::200e]/', noFilter);
    assert.strictEqual(result.blocked, false);
  });
});
