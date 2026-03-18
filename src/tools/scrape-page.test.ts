import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapePageDeps, registerScrapePage } from './scrape-page.js';
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

function createFakePage(overrides: Record<string, any> = {}) {
  return {
    goto: overrides.goto ?? (async () => ({ status: () => 200 })),
    title: overrides.title ?? (async () => 'Test Page'),
    innerHTML: overrides.innerHTML ?? (async () => '<h1>Hello</h1><p>World</p>'),
    evaluate: overrides.evaluate ?? (async () => [{ text: 'Link', href: 'https://example.com' }]),
    url: overrides.url ?? (() => 'https://example.com/'),
    waitForSelector: overrides.waitForSelector ?? (async () => {}),
  };
}

describe('scrape_page', () => {
  test('happy path: returns markdown and links', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000 });
    setNavigated(false);

    const origEnsurePage = scrapePageDeps.ensurePage;
    const origHasNavigated = scrapePageDeps.hasNavigated;
    const origReconnectFresh = scrapePageDeps.reconnectFresh;

    const fakePage = createFakePage();
    scrapePageDeps.ensurePage = async () => fakePage as any;
    scrapePageDeps.hasNavigated = () => false;
    scrapePageDeps.reconnectFresh = async () => {};

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapePage(server as any);
      const result = await getHandler()({ url: 'https://example.com' });
      assert.equal(result.isError, undefined);
      assert.ok(result.content[0].text.includes('# Test Page'));
      assert.ok(result.content[0].text.includes('Hello'));
      assert.ok(result.content[0].text.includes('## Links'));
    } finally {
      scrapePageDeps.ensurePage = origEnsurePage;
      scrapePageDeps.hasNavigated = origHasNavigated;
      scrapePageDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('domain blocked returns isError', async () => {
    const config = getConfig();
    setConfig({ ...config, domainBlocklist: ['blocked.com'], defaultTimeout: 1000 });

    const origEnsurePage = scrapePageDeps.ensurePage;
    const origHasNavigated = scrapePageDeps.hasNavigated;
    const origReconnectFresh = scrapePageDeps.reconnectFresh;

    scrapePageDeps.ensurePage = async () => createFakePage() as any;
    scrapePageDeps.hasNavigated = () => false;
    scrapePageDeps.reconnectFresh = async () => {};

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapePage(server as any);
      const result = await getHandler()({ url: 'https://blocked.com/page' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('blocked'));
    } finally {
      scrapePageDeps.ensurePage = origEnsurePage;
      scrapePageDeps.hasNavigated = origHasNavigated;
      scrapePageDeps.reconnectFresh = origReconnectFresh;
      setConfig(config);
    }
  });

  test('reconnectFresh called when hasNavigated is true', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000 });
    setNavigated(true);

    const origEnsurePage = scrapePageDeps.ensurePage;
    const origHasNavigated = scrapePageDeps.hasNavigated;
    const origReconnectFresh = scrapePageDeps.reconnectFresh;

    let reconnects = 0;
    const fakePage = createFakePage();
    scrapePageDeps.ensurePage = async () => fakePage as any;
    scrapePageDeps.hasNavigated = () => true;
    scrapePageDeps.reconnectFresh = async () => { reconnects++; };

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapePage(server as any);
      await getHandler()({ url: 'https://example.com' });
      assert.equal(reconnects, 1);
    } finally {
      scrapePageDeps.ensurePage = origEnsurePage;
      scrapePageDeps.hasNavigated = origHasNavigated;
      scrapePageDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('retries on recoverable error', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000 });
    setNavigated(false);

    const origEnsurePage = scrapePageDeps.ensurePage;
    const origHasNavigated = scrapePageDeps.hasNavigated;
    const origReconnectFresh = scrapePageDeps.reconnectFresh;

    let attempts = 0;
    let reconnects = 0;
    const fakePage = createFakePage({
      goto: async () => {
        attempts++;
        if (attempts === 1) throw new Error('target closed');
        return { status: () => 200 };
      },
    });
    scrapePageDeps.ensurePage = async () => fakePage as any;
    scrapePageDeps.hasNavigated = () => false;
    scrapePageDeps.reconnectFresh = async () => { reconnects++; };

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapePage(server as any);
      const result = await getHandler()({ url: 'https://example.com' });
      assert.equal(result.isError, undefined);
      assert.equal(attempts, 2);
      assert.equal(reconnects, 1);
    } finally {
      scrapePageDeps.ensurePage = origEnsurePage;
      scrapePageDeps.hasNavigated = origHasNavigated;
      scrapePageDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('waitFor param calls waitForSelector', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000 });
    setNavigated(false);

    const origEnsurePage = scrapePageDeps.ensurePage;
    const origHasNavigated = scrapePageDeps.hasNavigated;
    const origReconnectFresh = scrapePageDeps.reconnectFresh;

    let waitCalled = false;
    const fakePage = createFakePage({
      waitForSelector: async () => { waitCalled = true; },
    });
    scrapePageDeps.ensurePage = async () => fakePage as any;
    scrapePageDeps.hasNavigated = () => false;
    scrapePageDeps.reconnectFresh = async () => {};

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapePage(server as any);
      await getHandler()({ url: 'https://example.com', waitFor: '.content' });
      assert.equal(waitCalled, true);
    } finally {
      scrapePageDeps.ensurePage = origEnsurePage;
      scrapePageDeps.hasNavigated = origHasNavigated;
      scrapePageDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('blocks redirects to restricted domains', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000, domainBlocklist: ['blocked.com'] });
    setNavigated(false);

    const origEnsurePage = scrapePageDeps.ensurePage;
    const origHasNavigated = scrapePageDeps.hasNavigated;
    const origReconnectFresh = scrapePageDeps.reconnectFresh;

    let reconnects = 0;
    const fakePage = createFakePage({
      url: () => 'https://blocked.com/landing',
    });
    scrapePageDeps.ensurePage = async () => fakePage as any;
    scrapePageDeps.hasNavigated = () => false;
    scrapePageDeps.reconnectFresh = async () => { reconnects++; };

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapePage(server as any);
      const result = await getHandler()({ url: 'https://example.com' });
      assert.equal(result.isError, true);
      assert.equal(reconnects, 1);
      assert.ok(result.content[0].text.includes('redirected to a restricted domain'));
    } finally {
      scrapePageDeps.ensurePage = origEnsurePage;
      scrapePageDeps.hasNavigated = origHasNavigated;
      scrapePageDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });
});
