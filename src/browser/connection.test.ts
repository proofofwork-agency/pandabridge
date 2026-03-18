import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { attachListeners, connectAndSetup } from './connection.js';
import { getBrowser, getContext, getPage, getErrorLogs, setBrowser, setContext, setPage } from './state.js';

describe('connectAndSetup', () => {
  test('prefers creating a fresh page in an existing context', async () => {
    const existingPage = {
      title: async () => {
        throw new Error('stale existing page');
      },
      on: () => {},
    };
    let pageContext: any;
    const freshPage = {
      context: () => pageContext,
      on: () => {},
    };

    const fakeContext = {
      pages: () => [existingPage],
      newPage: async () => freshPage,
    };
    pageContext = fakeContext;

    const fakeBrowser = {
      contexts: () => [fakeContext],
      on: () => {},
    };

    const { chromium } = await import('playwright-core');
    const originalConnect = chromium.connectOverCDP;
    (chromium as any).connectOverCDP = async () => fakeBrowser;

    try {
      await connectAndSetup({ cdpEndpoint: 'http://localhost:9222', host: '127.0.0.1', port: 9222, cdpRetryAttempts: 1, cdpRetryDelayMs: 100 } as any);
      assert.equal(getPage(), freshPage);
      assert.equal(getContext(), fakeContext);
    } finally {
      setPage(null);
      setContext(null);
      setBrowser(null);
      (chromium as any).connectOverCDP = originalConnect;
    }
  });

  test('reuses an existing page when creating a fresh page fails', async () => {
    const existingPage = {
      context: () => fakeContext,
      title: async () => 'Existing page',
      on: () => {},
    };

    const fakeContext = {
      pages: () => [existingPage],
      newPage: async () => {
        throw new Error('newPage failed');
      },
    };

    const fakeBrowser = {
      contexts: () => [fakeContext],
      on: () => {},
    };

    const { chromium } = await import('playwright-core');
    const originalConnect = chromium.connectOverCDP;
    (chromium as any).connectOverCDP = async () => fakeBrowser;

    try {
      await connectAndSetup({ cdpEndpoint: 'http://localhost:9222', host: '127.0.0.1', port: 9222, cdpRetryAttempts: 1, cdpRetryDelayMs: 100 } as any);
      assert.equal(getPage(), existingPage);
      assert.equal(getContext(), fakeContext);
    } finally {
      setPage(null);
      setContext(null);
      setBrowser(null);
      (chromium as any).connectOverCDP = originalConnect;
    }
  });

  test('creates a fresh context only when no contexts exist', async () => {
    const createdContext = {
      newPage: async () => freshPage,
    };
    const freshPage = {
      context: () => createdContext,
      on: () => {},
    };

    const fakeBrowser = {
      contexts: () => [],
      newContext: async () => createdContext,
      on: () => {},
    };

    const { chromium } = await import('playwright-core');
    const originalConnect = chromium.connectOverCDP;
    (chromium as any).connectOverCDP = async () => fakeBrowser;

    try {
      await connectAndSetup({ cdpEndpoint: 'http://localhost:9222', host: '127.0.0.1', port: 9222, cdpRetryAttempts: 1, cdpRetryDelayMs: 100 } as any);
      assert.equal(getPage(), freshPage);
      assert.equal(getContext(), createdContext);
    } finally {
      setPage(null);
      setContext(null);
      setBrowser(null);
      (chromium as any).connectOverCDP = originalConnect;
    }
  });

  test('clears active state when browser disconnects', async () => {
    const handlers = new Map<string, () => void>();
    const freshPage = {
      context: () => fakeContext,
      on: () => {},
    };
    const fakeContext = {
      pages: () => [],
      newPage: async () => freshPage,
    };
    const fakeBrowser = {
      contexts: () => [fakeContext],
      on: (event: string, handler: () => void) => handlers.set(event, handler),
      isConnected: () => true,
    };

    const { chromium } = await import('playwright-core');
    const originalConnect = chromium.connectOverCDP;
    (chromium as any).connectOverCDP = async () => fakeBrowser;

    try {
      await connectAndSetup({ cdpEndpoint: 'http://localhost:9222', host: '127.0.0.1', port: 9222, cdpRetryAttempts: 1, cdpRetryDelayMs: 100 } as any);
      handlers.get('disconnected')?.();
      assert.equal(getBrowser(), null);
      assert.equal(getPage(), null);
      assert.equal(getContext(), null);
      assert.ok(getErrorLogs().some((entry) => entry.message === 'Browser disconnected'));
    } finally {
      setPage(null);
      setContext(null);
      setBrowser(null);
      (chromium as any).connectOverCDP = originalConnect;
    }
  });
});

describe('attachListeners', () => {
  test('registers console, request, response, requestfailed, pageerror, and crash listeners', () => {
    const events: string[] = [];
    const fakePage = { on: (event: string) => { events.push(event); } } as any;
    attachListeners(fakePage);
    assert.ok(events.includes('console'));
    assert.ok(events.includes('request'));
    assert.ok(events.includes('response'));
    assert.ok(events.includes('requestfailed'));
    assert.ok(events.includes('pageerror'));
    assert.ok(events.includes('crash'));
  });

  test('does not double-register on same page object', () => {
    const events: string[] = [];
    const fakePage = { on: (event: string) => { events.push(event); } } as any;
    attachListeners(fakePage);
    const firstCount = events.length;
    attachListeners(fakePage);
    assert.equal(events.length, firstCount);
  });
});
