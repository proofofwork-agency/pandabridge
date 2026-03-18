import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { registerBrowserSelectOption } from './browser-select-option.js';
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

describe('browser_select_option', () => {
  test('fails fast when the selector is missing without calling selectOption', async () => {
    let selectCalled = false;
    const fakePage = {
      evaluate: async () => ({ exists: false }),
      selectOption: async () => {
        selectCalled = true;
        return [];
      },
      url: () => 'https://example.com/',
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserSelectOption(server as any);

      const result = await getHandler()({ selector: 'select', value: 'test' });
      assert.equal(result.isError, true);
      assert.equal(selectCalled, false);
      assert.match(result.content[0].text, /No element matches select/);
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });

  test('selects values on select elements when present', async () => {
    let selectArgs: any[] | null = null;
    const fakePage = {
      evaluate: async () => ({ exists: true, tagName: 'select', isContentEditable: false, disabled: false }),
      selectOption: async (...args: any[]) => {
        selectArgs = args;
        return ['test'];
      },
      waitForLoadState: async () => {},
      url: () => 'https://example.com/',
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserSelectOption(server as any);

      const result = await getHandler()({ selector: 'select', value: 'test' });
      assert.equal(result.isError, undefined);
      assert.deepEqual(selectArgs, ['select', 'test', { timeout: 15000 }]);
      assert.match(result.content[0].text, /Selected "test" in select/);
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });
});
