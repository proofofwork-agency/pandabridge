import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensurePage, setPage, setBrowser, setNavigated,
  startNetworkRequest, completeNetworkRequest, getNetworkLogs, clearNetworkLogs,
} from './state.js';
import { getConfig, setConfig } from '../config.js';

describe('ensurePage', () => {
  test('returns pre-navigation page without evaluate', async () => {
    // No evaluate method needed — pre-navigation pages are trusted
    const fakePage = {
      url: () => 'about:blank',
    } as any;
    setPage(fakePage);
    setBrowser({} as any);
    setNavigated(false);
    try {
      const result = await ensurePage();
      assert.equal(result, fakePage);
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });

  test('returns post-navigation page when evaluate succeeds', async () => {
    const fakePage = {
      evaluate: async () => 1,
      url: () => 'http://example.com',
    } as any;
    setPage(fakePage);
    setBrowser({} as any);
    setNavigated(true);
    try {
      const result = await ensurePage();
      assert.equal(result, fakePage);
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });

  test('detects stale post-navigation page and attempts reconnection', async () => {
    const previousConfig = getConfig();
    const stalePage = {
      evaluate: async () => { throw new Error('Target closed'); },
    } as any;
    setPage(stalePage);
    setBrowser({} as any);
    setNavigated(true);
    try {
      setConfig({
        ...previousConfig,
        cdpEndpoint: 'http://127.0.0.1:1',
        cdpRetryAttempts: 1,
        cdpRetryDelayMs: 100,
      });
      await assert.rejects(
        () => ensurePage(),
        (err: Error) => {
          assert.ok(err.message.includes('reconnection failed') || err.message.includes('No active page'));
          return true;
        }
      );
    } finally {
      setConfig(previousConfig);
      setPage(null);
      setBrowser(null);
    }
  });

  test('throws when page is null and reconnection fails', async () => {
    const previousConfig = getConfig();
    setPage(null);
    setBrowser(null);
    try {
      setConfig({
        ...previousConfig,
        cdpEndpoint: 'http://127.0.0.1:1',
        cdpRetryAttempts: 1,
        cdpRetryDelayMs: 100,
      });
      await assert.rejects(
        () => ensurePage(),
        (err: Error) => {
          assert.ok(err.message.includes('reconnection failed') || err.message.includes('No active page'));
          return true;
        }
      );
    } finally {
      setConfig(previousConfig);
    }
  });
});

describe('completeNetworkRequest', () => {
  test('updates both map and array with new entry', () => {
    clearNetworkLogs();
    startNetworkRequest('r1', { requestId: 'r1', method: 'GET', url: 'http://a.com', timestamp: 0 });
    completeNetworkRequest('r1', { status: 200, durationMs: 42 });
    const logs = getNetworkLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 200);
    assert.equal(logs[0].durationMs, 42);
    assert.equal(logs[0].method, 'GET');
    clearNetworkLogs();
  });

  test('ignores unknown request id', () => {
    clearNetworkLogs();
    startNetworkRequest('r1', { requestId: 'r1', method: 'POST', url: 'http://b.com', timestamp: 0 });
    completeNetworkRequest('unknown', { status: 404 });
    const logs = getNetworkLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, undefined);
    clearNetworkLogs();
  });

  test('preserves original fields when merging updates', () => {
    clearNetworkLogs();
    startNetworkRequest('r1', { requestId: 'r1', method: 'GET', url: 'http://c.com', timestamp: 100 });
    completeNetworkRequest('r1', { status: 200, contentType: 'text/html' });
    const logs = getNetworkLogs();
    assert.equal(logs[0].url, 'http://c.com');
    assert.equal(logs[0].timestamp, 100);
    assert.equal(logs[0].status, 200);
    assert.equal(logs[0].contentType, 'text/html');
    clearNetworkLogs();
  });
});
