import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerBrowserClick } from './browser-click.js';
import { setBrowser, setPage } from '../browser/state.js';

function createFakeServer() {
  let handler: ((args: Record<string, any>) => Promise<any>) | null = null;

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

describe('browser_click', () => {
  test('uses the configured timeout for post-click navigation waits', async () => {
    let receivedTimeout: number | null = null;
    let clickedSelector: string | null = null;

    const fakePage = {
      waitForNavigation: async (opts: { timeout: number }) => {
        receivedTimeout = opts.timeout;
      },
      click: async (selector: string) => {
        clickedSelector = selector;
      },
      title: async () => 'Example Domain',
      url: () => 'https://example.com/',
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserClick(server as any);

      const result = await getHandler()({ selector: 'a' });
      assert.equal(clickedSelector, 'a');
      assert.equal(receivedTimeout, 15000);
      assert.equal(result.isError, undefined);
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });
});
