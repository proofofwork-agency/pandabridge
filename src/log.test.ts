import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setConfig } from './config.js';
import type { Config } from './config.js';
import { log, logCritical } from './log.js';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    host: '127.0.0.1',
    port: 9222,
    outputMaxChars: 8000,
    outputMaxElements: 50,
    defaultTimeout: 15000,
    logBufferMax: 500,
    domainAllowlist: [],
    domainBlocklist: [],
    cdpRetryAttempts: 3,
    cdpRetryDelayMs: 1000,
    evaluateEnabled: true,
    debug: false,
    cdpEndpoint: 'http://127.0.0.1:9222',
    ...overrides,
  };
}

describe('log', () => {
  let stderrOutput: string;
  const originalWrite = process.stderr.write;

  beforeEach(() => {
    stderrOutput = '';
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrOutput += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
  });

  it('suppresses output when debug is false', () => {
    setConfig(makeConfig({ debug: false }));
    log('test message');
    assert.equal(stderrOutput, '');
  });

  it('emits output when debug is true', () => {
    setConfig(makeConfig({ debug: true }));
    log('test message');
    assert.equal(stderrOutput, '[pandabridge] test message\n');
  });

  it('logCritical always emits regardless of debug flag', () => {
    setConfig(makeConfig({ debug: false }));
    logCritical('critical message');
    assert.equal(stderrOutput, '[pandabridge] critical message\n');
  });
});
