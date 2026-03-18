import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkDomain } from './domain-filter.js';

describe('checkDomain', () => {
  test('allows when no lists set', () => {
    const result = checkDomain('https://example.com', { domainAllowlist: [], domainBlocklist: [] });
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
    const result = checkDomain('not-a-url', { domainAllowlist: [], domainBlocklist: [] });
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('Invalid URL'));
  });

  test('empty lists behave as no restriction', () => {
    const result = checkDomain('https://anything.com', { domainAllowlist: [], domainBlocklist: [] });
    assert.equal(result.blocked, false);
  });

  test('blocks file:// protocol (SSRF)', () => {
    const result = checkDomain('file:///etc/passwd', { domainAllowlist: [], domainBlocklist: [] });
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('Blocked protocol'));
  });

  test('blocks data: protocol (SSRF)', () => {
    const result = checkDomain('data:text/html,<h1>hi</h1>', { domainAllowlist: [], domainBlocklist: [] });
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('Blocked protocol'));
  });

  test('blocks javascript: URLs (invalid URL)', () => {
    const result = checkDomain('javascript:alert(1)', { domainAllowlist: [], domainBlocklist: [] });
    assert.equal(result.blocked, true);
  });

  test('blocks ftp:// protocol', () => {
    const result = checkDomain('ftp://example.com/file', { domainAllowlist: [], domainBlocklist: [] });
    assert.equal(result.blocked, true);
    assert.ok(result.reason?.includes('Blocked protocol'));
  });

  test('allows http:// protocol', () => {
    const result = checkDomain('http://example.com', { domainAllowlist: [], domainBlocklist: [] });
    assert.equal(result.blocked, false);
  });

  test('allows https:// protocol', () => {
    const result = checkDomain('https://example.com', { domainAllowlist: [], domainBlocklist: [] });
    assert.equal(result.blocked, false);
  });
});
