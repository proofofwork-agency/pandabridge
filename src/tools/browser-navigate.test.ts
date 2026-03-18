import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { navigateDeps, registerBrowserNavigate } from './browser-navigate.js';
import { getConfig, setConfig } from '../config.js';
import { setNavigated } from '../browser/state.js';

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

describe('browser_navigate', () => {
  test('rotates to a fresh connection after the first navigation', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000 });
    setNavigated(true);

    const originalReconnectFresh = navigateDeps.reconnectFresh;
    const originalEnsurePage = navigateDeps.ensurePage;
    const originalHasNavigated = navigateDeps.hasNavigated;

    let reconnects = 0;
    let gotos = 0;
    const fakePage = {
      goto: async () => {
        gotos += 1;
        return { status: () => 200 };
      },
      title: async () => 'Demo',
      url: () => 'http://example.test/',
    };

    navigateDeps.reconnectFresh = async () => {
      reconnects += 1;
    };
    navigateDeps.ensurePage = async () => fakePage as any;
    navigateDeps.hasNavigated = () => true;

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserNavigate(server as any);
      const result = await getHandler()({ url: 'http://example.test/' });
      assert.equal(result.isError, undefined);
      assert.equal(reconnects, 1);
      assert.equal(gotos, 1);
      assert.ok(result.content[0].text.includes('Title: Demo'));
    } finally {
      navigateDeps.reconnectFresh = originalReconnectFresh;
      navigateDeps.ensurePage = originalEnsurePage;
      navigateDeps.hasNavigated = originalHasNavigated;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('retries once on recoverable target-closed navigation errors', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000 });
    setNavigated(false);

    const originalReconnectFresh = navigateDeps.reconnectFresh;
    const originalEnsurePage = navigateDeps.ensurePage;
    const originalHasNavigated = navigateDeps.hasNavigated;

    let reconnects = 0;
    let attempts = 0;
    const fakePage = {
      goto: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Target page, context or browser has been closed');
        }
        return { status: () => 204 };
      },
      title: async () => 'Recovered',
      url: () => 'http://example.test/recovered',
    };

    navigateDeps.reconnectFresh = async () => {
      reconnects += 1;
    };
    navigateDeps.ensurePage = async () => fakePage as any;
    navigateDeps.hasNavigated = () => false;

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserNavigate(server as any);
      const result = await getHandler()({ url: 'http://example.test/' });
      assert.equal(reconnects, 1);
      assert.equal(attempts, 2);
      assert.ok(result.content[0].text.includes('Status: 204'));
    } finally {
      navigateDeps.reconnectFresh = originalReconnectFresh;
      navigateDeps.ensurePage = originalEnsurePage;
      navigateDeps.hasNavigated = originalHasNavigated;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('blocks redirects to restricted domains and reconnects away from them', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000, domainBlocklist: ['blocked.test'] });
    setNavigated(false);

    const originalReconnectFresh = navigateDeps.reconnectFresh;
    const originalEnsurePage = navigateDeps.ensurePage;
    const originalHasNavigated = navigateDeps.hasNavigated;

    let reconnects = 0;
    const fakePage = {
      goto: async () => ({ status: () => 302 }),
      title: async () => 'Blocked Redirect',
      url: () => 'https://blocked.test/landing',
    };

    navigateDeps.reconnectFresh = async () => {
      reconnects += 1;
    };
    navigateDeps.ensurePage = async () => fakePage as any;
    navigateDeps.hasNavigated = () => false;

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserNavigate(server as any);
      const result = await getHandler()({ url: 'https://allowed.test/start' });
      assert.equal(result.isError, true);
      assert.equal(reconnects, 1);
      assert.ok(result.content[0].text.includes('redirected to a restricted domain'));
    } finally {
      navigateDeps.reconnectFresh = originalReconnectFresh;
      navigateDeps.ensurePage = originalEnsurePage;
      navigateDeps.hasNavigated = originalHasNavigated;
      setNavigated(false);
      setConfig(config);
    }
  });
});
