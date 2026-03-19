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

  test('downgrades fragile input types before filling', async () => {
    const evaluateCalls: any[] = [];
    let fillCalled = false;
    let evaluateCallIndex = 0;

    const fakePage = {
      evaluate: async (fn: any, arg?: any) => {
        evaluateCallIndex++;
        // First evaluate call is inspectDomTarget
        if (evaluateCallIndex === 1) {
          return { exists: true, tagName: 'input', inputType: 'email', isContentEditable: false, disabled: false };
        }
        // Second is the downgrade
        evaluateCalls.push({ fn: fn.toString(), arg });
      },
      fill: async () => { fillCalled = true; },
      waitForLoadState: async () => {},
      url: () => 'https://example.com/',
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserType(server as any);

      const result = await getHandler()({ selector: 'input[name="email"]', value: 'test@example.com' });
      assert.equal(result.isError, undefined);
      assert.equal(fillCalled, true, 'fill should still be called');
      assert.equal(evaluateCalls.length, 1, 'downgrade evaluate should have been called');
      assert.deepEqual(evaluateCalls[0].arg, ['input[name="email"]', 'email']);
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });

  test('skips downgrade for standard text inputs', async () => {
    let evaluateCallCount = 0;

    const fakePage = {
      evaluate: async () => {
        evaluateCallCount++;
        if (evaluateCallCount === 1) {
          return { exists: true, tagName: 'input', inputType: 'text', isContentEditable: false, disabled: false };
        }
      },
      fill: async () => {},
      waitForLoadState: async () => {},
      url: () => 'https://example.com/',
    } as any;

    setPage(fakePage);
    setBrowser({} as any);

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserType(server as any);

      await getHandler()({ selector: 'input', value: 'test' });
      assert.equal(evaluateCallCount, 1, 'only inspectDomTarget should call evaluate, no downgrade');
    } finally {
      setPage(null);
      setBrowser(null);
    }
  });
});
