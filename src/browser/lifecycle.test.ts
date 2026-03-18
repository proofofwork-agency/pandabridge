import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { restartLightpandaIfNeeded } from './lifecycle.js';
import type { Config } from '../config.js';

function makeConfig(overrides: Partial<Config> = {}): Config {
  const port = overrides.port ?? 9444;
  return {
    host: '127.0.0.1',
    port,
    cdpEndpoint: `http://127.0.0.1:${port}`,
    cdpRetryAttempts: 3,
    cdpRetryDelayMs: 500,
    outputMaxChars: 8000,
    outputMaxElements: 50,
    defaultTimeout: 15000,
    logBufferMax: 500,
    domainAllowlist: [],
    domainBlocklist: [],
    batchMaxUrls: 10,
    evaluateEnabled: false,
    debug: false,
    ...overrides,
  } as Config;
}

describe('restartLightpandaIfNeeded', () => {
  test('is a no-op when pandabridge did not start Lightpanda', async () => {
    // managedBinaryPath is null because maybeStartLightpanda was never called
    // with a successful spawn. Should return immediately without spawning.
    const config = makeConfig();
    await restartLightpandaIfNeeded(config);
    assert.ok(true, 'returned without error');
  });

  test('does not modify config.binary', async () => {
    const config = makeConfig({ binary: undefined });
    const originalBinary = config.binary;
    await restartLightpandaIfNeeded(config);
    assert.equal(config.binary, originalBinary, 'config.binary should not be mutated');
  });

  test('is safe to call multiple times when not managing a process', async () => {
    const config = makeConfig();
    await restartLightpandaIfNeeded(config);
    await restartLightpandaIfNeeded(config);
    await restartLightpandaIfNeeded(config);
    assert.ok(true, 'multiple calls returned without error');
  });
});
