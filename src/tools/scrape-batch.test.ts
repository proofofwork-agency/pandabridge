import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapeBatchDeps, registerScrapeBatch } from './scrape-batch.js';
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
    innerHTML: overrides.innerHTML ?? (async () => '<h1>Hello</h1>'),
    evaluate: overrides.evaluate ?? (async () => 3),
    url: overrides.url ?? (() => 'https://example.com/'),
    waitForSelector: overrides.waitForSelector ?? (async () => {}),
  };
}

describe('scrape_batch', () => {
  test('happy path: 2 URLs return both titles', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000, batchMaxUrls: 10 });
    setNavigated(false);

    const origEnsurePage = scrapeBatchDeps.ensurePage;
    const origHasNavigated = scrapeBatchDeps.hasNavigated;
    const origReconnectFresh = scrapeBatchDeps.reconnectFresh;

    let callCount = 0;
    const fakePage = createFakePage({
      title: async () => {
        callCount++;
        return `Page ${callCount}`;
      },
    });
    scrapeBatchDeps.ensurePage = async () => fakePage as any;
    scrapeBatchDeps.hasNavigated = () => false;
    scrapeBatchDeps.reconnectFresh = async () => {};

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapeBatch(server as any);
      const result = await getHandler()({
        urls: ['https://example.com/a', 'https://example.com/b'],
      });
      assert.equal(result.isError, undefined);
      assert.ok(result.content[0].text.includes('Page 1'));
      assert.ok(result.content[0].text.includes('Page 2'));
      assert.ok(result.content[0].text.includes('[1/2]'));
      assert.ok(result.content[0].text.includes('[2/2]'));
    } finally {
      scrapeBatchDeps.ensurePage = origEnsurePage;
      scrapeBatchDeps.hasNavigated = origHasNavigated;
      scrapeBatchDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('exceeds batchMaxUrls returns isError', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000, batchMaxUrls: 2 });

    const origEnsurePage = scrapeBatchDeps.ensurePage;
    const origHasNavigated = scrapeBatchDeps.hasNavigated;
    const origReconnectFresh = scrapeBatchDeps.reconnectFresh;

    scrapeBatchDeps.ensurePage = async () => createFakePage() as any;
    scrapeBatchDeps.hasNavigated = () => false;
    scrapeBatchDeps.reconnectFresh = async () => {};

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapeBatch(server as any);
      const result = await getHandler()({
        urls: ['https://a.com', 'https://b.com', 'https://c.com'],
      });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('Batch too large'));
    } finally {
      scrapeBatchDeps.ensurePage = origEnsurePage;
      scrapeBatchDeps.hasNavigated = origHasNavigated;
      scrapeBatchDeps.reconnectFresh = origReconnectFresh;
      setConfig(config);
    }
  });

  test('partial failure: URL 1 ok, URL 2 throws, outer not isError', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000, batchMaxUrls: 10 });
    setNavigated(false);

    const origEnsurePage = scrapeBatchDeps.ensurePage;
    const origHasNavigated = scrapeBatchDeps.hasNavigated;
    const origReconnectFresh = scrapeBatchDeps.reconnectFresh;

    let gotoCount = 0;
    const fakePage = createFakePage({
      goto: async () => {
        gotoCount++;
        if (gotoCount === 2) throw new Error('Network error');
        return { status: () => 200 };
      },
    });
    scrapeBatchDeps.ensurePage = async () => fakePage as any;
    scrapeBatchDeps.hasNavigated = () => false;
    scrapeBatchDeps.reconnectFresh = async () => {};

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapeBatch(server as any);
      const result = await getHandler()({
        urls: ['https://example.com/ok', 'https://example.com/fail'],
      });
      assert.equal(result.isError, undefined);
      assert.ok(result.content[0].text.includes('Test Page'));
      assert.ok(result.content[0].text.includes('FAILED'));
    } finally {
      scrapeBatchDeps.ensurePage = origEnsurePage;
      scrapeBatchDeps.hasNavigated = origHasNavigated;
      scrapeBatchDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('domain-blocked URL in batch shows failure, others succeed', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000, batchMaxUrls: 10, domainBlocklist: ['blocked.com'] });
    setNavigated(false);

    const origEnsurePage = scrapeBatchDeps.ensurePage;
    const origHasNavigated = scrapeBatchDeps.hasNavigated;
    const origReconnectFresh = scrapeBatchDeps.reconnectFresh;

    const fakePage = createFakePage();
    scrapeBatchDeps.ensurePage = async () => fakePage as any;
    scrapeBatchDeps.hasNavigated = () => false;
    scrapeBatchDeps.reconnectFresh = async () => {};

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapeBatch(server as any);
      const result = await getHandler()({
        urls: ['https://example.com', 'https://blocked.com/page'],
      });
      assert.equal(result.isError, undefined);
      assert.ok(result.content[0].text.includes('Test Page'));
      assert.ok(result.content[0].text.includes('FAILED'));
      assert.ok(result.content[0].text.includes('blocked'));
    } finally {
      scrapeBatchDeps.ensurePage = origEnsurePage;
      scrapeBatchDeps.hasNavigated = origHasNavigated;
      scrapeBatchDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });

  test('redirects to restricted domains are reported as failures and reconnect away', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000, batchMaxUrls: 10, domainBlocklist: ['blocked.com'] });
    setNavigated(false);

    const origEnsurePage = scrapeBatchDeps.ensurePage;
    const origHasNavigated = scrapeBatchDeps.hasNavigated;
    const origReconnectFresh = scrapeBatchDeps.reconnectFresh;

    let reconnects = 0;
    const fakePage = createFakePage({
      url: () => 'https://blocked.com/landing',
    });
    scrapeBatchDeps.ensurePage = async () => fakePage as any;
    scrapeBatchDeps.hasNavigated = () => false;
    scrapeBatchDeps.reconnectFresh = async () => { reconnects++; };

    try {
      const { server, getHandler } = createFakeServer();
      registerScrapeBatch(server as any);
      const result = await getHandler()({
        urls: ['https://example.com/start'],
      });
      assert.equal(result.isError, undefined);
      assert.equal(reconnects, 1);
      assert.ok(result.content[0].text.includes('FAILED'));
      assert.ok(result.content[0].text.includes('redirected to a restricted domain'));
    } finally {
      scrapeBatchDeps.ensurePage = origEnsurePage;
      scrapeBatchDeps.hasNavigated = origHasNavigated;
      scrapeBatchDeps.reconnectFresh = origReconnectFresh;
      setNavigated(false);
      setConfig(config);
    }
  });
});
