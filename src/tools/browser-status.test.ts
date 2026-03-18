import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerBrowserStatus } from './browser-status.js';
import { setBrowser, setNavigated, setPage } from '../browser/state.js';

function createFakeServer() {
  let handler: ((args: Record<string, never>) => Promise<any>) | null = null;

  return {
    server: {
      tool(...args: any[]) {
        handler = args[args.length - 1];
      },
    },
    getHandler() {
      if (!handler) throw new Error('tool handler was not registered');
      return handler;
    },
  };
}

describe('browser_status', () => {
  test('reports pre-navigation page as ready without probing it', async () => {
    const fakePage = {
      evaluate: async () => {
        throw new Error('should not evaluate before first navigation');
      },
      title: async () => {
        throw new Error('should not read title before first navigation');
      },
      url: () => 'about:blank',
    } as any;

    const { server, getHandler } = createFakeServer();
    registerBrowserStatus(server as any);

    setBrowser({ isConnected: () => true } as any);
    setPage(fakePage);
    setNavigated(false);

    try {
      const result = await getHandler()({});
      const text = result.content[0].text;
      assert.equal(result.isError, undefined);
      assert.ok(text.includes('Status: connected (ready)'));
      assert.ok(text.includes('Page is ready for first navigation.'));
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });

  test('reports stale page after navigation when liveness check fails', async () => {
    const fakePage = {
      evaluate: async () => {
        throw new Error('Target page closed');
      },
      url: () => 'https://example.com',
    } as any;

    const { server, getHandler } = createFakeServer();
    registerBrowserStatus(server as any);

    setBrowser({ isConnected: () => true } as any);
    setPage(fakePage);
    setNavigated(true);

    try {
      const result = await getHandler()({});
      const text = result.content[0].text;
      assert.equal(result.isError, undefined);
      assert.ok(text.includes('Status: connected (stale page)'));
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });
});
