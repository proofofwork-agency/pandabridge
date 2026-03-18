import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { debugReportDeps, registerBrowserDebugReport } from './browser-debug-report.js';
import { getConfig, setConfig } from '../config.js';
import {
  clearConsoleLogs,
  clearNetworkLogs,
  clearErrorLogs,
  addErrorLog,
  addConsoleLog,
  startNetworkRequest,
  completeNetworkRequest,
  setPage,
  setBrowser,
  setNavigated,
} from '../browser/state.js';

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

function createFakePage(opts: {
  title?: string;
  bodyText?: string;
  gotoStatus?: number;
  clickError?: string;
} = {}) {
  return {
    goto: async (_url: string, _opts?: any) => ({
      status: () => opts.gotoStatus ?? 200,
    }),
    title: async () => opts.title ?? 'Test Page',
    innerText: async () => opts.bodyText ?? 'page content here',
    url: () => 'http://example.com/test',
    click: async (selector: string) => {
      if (opts.clickError) throw new Error(opts.clickError);
    },
    fill: async () => {},
    selectOption: async () => {},
    keyboard: { press: async () => {} },
    evaluate: async () => {},
    waitForLoadState: async () => {},
  } as any;
}

describe('browser_debug_report', () => {
  beforeEach(() => {
    clearConsoleLogs();
    clearNetworkLogs();
    clearErrorLogs();
    setNavigated(false);
  });

  test('produces a basic report with page state', async () => {
    const fakePage = createFakePage({ title: 'My Page', bodyText: 'Hello World' });
    setPage(fakePage);
    setBrowser({} as any);

    const { server, getHandler } = createFakeServer();
    registerBrowserDebugReport(server as any);

    const result = await getHandler()({ url: 'http://example.com/test' });
    const text = result.content[0].text;

    assert.ok(text.includes('Debug Report'));
    assert.ok(text.includes('My Page'));
    assert.ok(text.includes('Status: 200'));
    assert.ok(text.includes('Hello World'));

    setPage(null);
    setBrowser(null);
  });

  test('includes symptom in report when provided', async () => {
    const fakePage = createFakePage();
    setPage(fakePage);
    setBrowser({} as any);

    const { server, getHandler } = createFakeServer();
    registerBrowserDebugReport(server as any);

    const result = await getHandler()({ url: 'http://example.com', symptom: 'page is blank' });
    const text = result.content[0].text;

    assert.ok(text.includes('Symptom: "page is blank"'));

    setPage(null);
    setBrowser(null);
  });

  test('reports errors in the output', async () => {
    // Errors must be injected during goto (after the handler clears logs)
    const fakePage = createFakePage();
    const origGoto = fakePage.goto;
    fakePage.goto = async (url: string, opts?: any) => {
      const res = await origGoto(url, opts);
      addErrorLog({ message: 'TypeError: x is null', type: 'exception', timestamp: Date.now() });
      return res;
    };
    setPage(fakePage);
    setBrowser({} as any);

    const { server, getHandler } = createFakeServer();
    registerBrowserDebugReport(server as any);

    const result = await getHandler()({ url: 'http://example.com' });
    const text = result.content[0].text;

    assert.ok(text.includes('Errors'));
    assert.ok(text.includes('TypeError: x is null'));

    setPage(null);
    setBrowser(null);
  });

  test('includes HTTP error responses (4xx/5xx) as failed requests', async () => {
    // Network entries must be injected during goto (after the handler clears logs)
    const fakePage = createFakePage();
    const origGoto = fakePage.goto;
    fakePage.goto = async (url: string, opts?: any) => {
      const res = await origGoto(url, opts);
      startNetworkRequest('req-1', {
        requestId: 'req-1',
        method: 'GET',
        url: 'http://example.com/missing',
        timestamp: Date.now(),
      });
      completeNetworkRequest('req-1', { status: 404, contentType: 'text/html' });
      startNetworkRequest('req-2', {
        requestId: 'req-2',
        method: 'POST',
        url: 'http://example.com/api',
        timestamp: Date.now(),
        failed: true,
        failureReason: 'net::ERR_CONNECTION_REFUSED',
      });
      return res;
    };
    setPage(fakePage);
    setBrowser({} as any);

    const { server, getHandler } = createFakeServer();
    registerBrowserDebugReport(server as any);

    const result = await getHandler()({ url: 'http://example.com' });
    const text = result.content[0].text;

    assert.ok(text.includes('Failed/Error Requests'), 'should have failed requests section');
    assert.ok(text.includes('GET http://example.com/missing 404'), 'should include 404 as HTTP error');
    assert.ok(text.includes('POST http://example.com/api FAILED'), 'should include transport failure');

    setPage(null);
    setBrowser(null);
  });

  test('reports action errors without aborting', async () => {
    const fakePage = createFakePage({ clickError: 'Element not found' });
    setPage(fakePage);
    setBrowser({} as any);

    const { server, getHandler } = createFakeServer();
    registerBrowserDebugReport(server as any);

    const result = await getHandler()({
      url: 'http://example.com',
      actions: [
        { type: 'click', selector: '#missing' },
      ],
    });
    const text = result.content[0].text;

    assert.ok(text.includes('Actions (1 performed)'));
    assert.ok(text.includes('ERROR: Element not found'));

    setPage(null);
    setBrowser(null);
  });

  test('fails type actions fast when the target is missing', async () => {
    let fillCalled = false;
    const fakePage = createFakePage();
    fakePage.evaluate = async (_fn: unknown, selector: string) => {
      if (selector === '#missing') return { exists: false };
    };
    fakePage.fill = async () => {
      fillCalled = true;
    };

    setPage(fakePage);
    setBrowser({} as any);

    const { server, getHandler } = createFakeServer();
    registerBrowserDebugReport(server as any);

    const result = await getHandler()({
      url: 'http://example.com',
      actions: [
        { type: 'type', selector: '#missing', value: 'hello' },
      ],
    });
    const text = result.content[0].text;

    assert.equal(fillCalled, false);
    assert.ok(text.includes('ERROR: No element matches #missing on the current page.'));

    setPage(null);
    setBrowser(null);
  });

  test('reports clean state when no issues found', async () => {
    const fakePage = createFakePage();
    setPage(fakePage);
    setBrowser({} as any);

    const { server, getHandler } = createFakeServer();
    registerBrowserDebugReport(server as any);

    const result = await getHandler()({ url: 'http://example.com' });
    const text = result.content[0].text;

    assert.ok(text.includes('No errors, failed/error requests, or console issues detected.'));

    setPage(null);
    setBrowser(null);
  });

  test('blocks redirects to restricted domains', async () => {
    const config = getConfig();
    setConfig({ ...config, defaultTimeout: 1000, domainBlocklist: ['blocked.com'] });

    const originalEnsurePage = debugReportDeps.ensurePage;
    const originalHasNavigated = debugReportDeps.hasNavigated;
    const originalReconnectFresh = debugReportDeps.reconnectFresh;

    let reconnects = 0;
    const fakePage = createFakePage();
    fakePage.url = () => 'https://blocked.com/landing';

    debugReportDeps.ensurePage = async () => fakePage as any;
    debugReportDeps.hasNavigated = () => false;
    debugReportDeps.reconnectFresh = async () => { reconnects++; };

    try {
      const { server, getHandler } = createFakeServer();
      registerBrowserDebugReport(server as any);

      const result = await getHandler()({ url: 'https://example.com' });
      assert.equal(result.isError, true);
      assert.equal(reconnects, 1);
      assert.ok(result.content[0].text.includes('redirected to a restricted domain'));
    } finally {
      debugReportDeps.ensurePage = originalEnsurePage;
      debugReportDeps.hasNavigated = originalHasNavigated;
      debugReportDeps.reconnectFresh = originalReconnectFresh;
      setConfig(config);
    }
  });
});
