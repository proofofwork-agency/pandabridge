import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig, setConfig } from '../config.js';
import type { Config } from '../config.js';

describe('browser-evaluate config', () => {
  test('evaluateEnabled defaults to false', () => {
    const config = getConfig();
    assert.equal(config.evaluateEnabled, false);
  });

  test('evaluateEnabled can be set to false', () => {
    const config = getConfig();
    const modified: Config = { ...config, evaluateEnabled: false };
    setConfig(modified);
    try {
      const loaded = getConfig();
      assert.equal(loaded.evaluateEnabled, false);
    } finally {
      // Reset
      setConfig(config);
    }
  });
});
