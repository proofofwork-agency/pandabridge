import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerBrowserType } from './browser-type.js';
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

describe('browser_type', () => {
  test('fails fast when the selector is missing without calling fill', async () => {
    let fillCalled = false;
    const fakePage = {
      evaluate: async () => ({ exists: false }),
      fill: async () => {
        fillCalled = true;
      },
      url: () => 'https://example.com/',
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserType(server as any);

      const result = await getHandler()({ selector: 'input', value: 'test' });
      assert.equal(result.isError, true);
      assert.equal(fillCalled, false);
      assert.match(result.content[0].text, /No element matches input/);
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });

  test('fills supported controls when present', async () => {
    let fillArgs: any[] | null = null;
    const fakePage = {
      evaluate: async () => ({ exists: true, tagName: 'input', isContentEditable: false, disabled: false }),
      fill: async (...args: any[]) => {
        fillArgs = args;
      },
      waitForLoadState: async () => {},
      url: () => 'https://example.com/',
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserType(server as any);

      const result = await getHandler()({ selector: 'input', value: 'test' });
      assert.equal(result.isError, undefined);
      assert.deepEqual(fillArgs, ['input', 'test', { timeout: 15000 }]);
      assert.match(result.content[0].text, /Set input to "test"/);
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });
});
