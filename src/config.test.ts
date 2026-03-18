import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Save and restore env vars around tests
let savedEnv: Record<string, string | undefined> = {};

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    savedEnv[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  savedEnv = {};
}

describe('getConfig', () => {
  afterEach(() => {
    restoreEnv();
    // Reset cache between tests by re-importing would be ideal, but since modules are cached,
    // we test env var behavior directly via the schema
  });

  test('default outputMaxChars is 8000', async () => {
    const { getConfig, setConfig } = await import('./config.js');
    // Reset cache
    setConfig(null as any);
    const config = getConfig();
    assert.equal(config.outputMaxChars, 8000);
    setConfig(config); // restore cache
  });

  test('default outputMaxElements is 50', async () => {
    const { getConfig, setConfig } = await import('./config.js');
    setConfig(null as any);
    const config = getConfig();
    assert.equal(config.outputMaxElements, 50);
  });

  test('env var PANDABRIDGE_OUTPUT_MAX_CHARS overrides default', async () => {
    setEnv({ PANDABRIDGE_OUTPUT_MAX_CHARS: '5000' });
    const { getConfig, setConfig } = await import('./config.js');
    setConfig(null as any);
    const config = getConfig();
    assert.equal(config.outputMaxChars, 5000);
    restoreEnv();
  });

  test('empty string PANDABRIDGE_EVALUATE_ENABLED does not break config', async () => {
    setEnv({ PANDABRIDGE_EVALUATE_ENABLED: '' });
    const { getConfig, setConfig } = await import('./config.js');
    setConfig(null as any);
    const config = getConfig();
    // Empty string should be ignored; evaluateEnabled should get its default (false)
    assert.equal(config.evaluateEnabled, false);
    // Other config values should still be intact (not reset to defaults due to Zod failure)
    assert.equal(config.outputMaxChars, 8000);
    restoreEnv();
  });

  test('config caching returns same object after setConfig', async () => {
    const { getConfig, setConfig } = await import('./config.js');
    setConfig(null as any);
    const config1 = getConfig();
    setConfig(config1);
    const config2 = getConfig();
    assert.strictEqual(config1, config2);
  });

  test('invalid outputMaxChars does not reset domainAllowlist', async () => {
    setEnv({
      PANDABRIDGE_OUTPUT_MAX_CHARS: 'abc',
      PANDABRIDGE_DOMAIN_ALLOWLIST: 'example.com',
    });
    const { getConfig, setConfig } = await import('./config.js');
    setConfig(null as any);
    const config = getConfig();
    assert.equal(config.outputMaxChars, 8000);
    assert.ok(config.domainAllowlist.includes('example.com'));
    restoreEnv();
  });

  test('invalid defaultTimeout preserves other numeric fields', async () => {
    setEnv({
      PANDABRIDGE_DEFAULT_TIMEOUT: 'notanumber',
      PANDABRIDGE_OUTPUT_MAX_ELEMENTS: '25',
    });
    const { getConfig, setConfig } = await import('./config.js');
    setConfig(null as any);
    const config = getConfig();
    assert.equal(config.defaultTimeout, 15000);
    assert.equal(config.outputMaxElements, 25);
    restoreEnv();
  });

  test('all valid env vars parse correctly (regression)', async () => {
    setEnv({
      LIGHTPANDA_HOST: '0.0.0.0',
      LIGHTPANDA_PORT: '9333',
      PANDABRIDGE_OUTPUT_MAX_CHARS: '5000',
      PANDABRIDGE_OUTPUT_MAX_ELEMENTS: '30',
      PANDABRIDGE_DEFAULT_TIMEOUT: '20000',
      PANDABRIDGE_EVALUATE_ENABLED: 'false',
    });
    const { getConfig, setConfig } = await import('./config.js');
    setConfig(null as any);
    const config = getConfig();
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.port, 9333);
    assert.equal(config.outputMaxChars, 5000);
    assert.equal(config.outputMaxElements, 30);
    assert.equal(config.defaultTimeout, 20000);
    assert.equal(config.evaluateEnabled, false);
    restoreEnv();
  });
});
