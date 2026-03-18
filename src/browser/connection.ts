import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page, Request } from 'playwright-core';
import type { Config } from '../config.js';
import { log, logCritical } from '../log.js';
import { toErrorMessage, toError } from '../util/errors.js';
import { CDP_CONNECT_TIMEOUT_MS } from '../util/constants.js';
import { restartLightpandaIfNeeded } from './lifecycle.js';
import {
  getBrowser,
  setBrowser,
  setContext,
  setPage,
  addConsoleLog,
  startNetworkRequest,
  completeNetworkRequest,
  addErrorLog,
} from './state.js';

export async function connectAndSetup(config: Config): Promise<void> {
  log(`Connecting to CDP at ${config.cdpEndpoint}`);

  const browser = await connectWithRetry(config);
  attachBrowserListeners(browser);
  setBrowser(browser);

  const page = await acquirePage(browser);
  setContext(page.context());
  attachListeners(page);
  setPage(page);

  log('Connected and ready');
}

export async function reconnectFresh(config: Config): Promise<void> {
  const currentBrowser = getBrowser();
  if (currentBrowser) {
    try {
      markExpectedDisconnect(currentBrowser);
      await currentBrowser.close();
    } catch (err) {
      logCritical(`Browser close error during reconnect: ${toErrorMessage(err)}`);
    }
  }

  // Clear request tracking to prevent unbounded Map growth
  requestTimestamps.clear();

  setPage(null);
  setContext(null);
  setBrowser(null);

  await restartLightpandaIfNeeded(config);
  await connectAndSetup(config);
}

async function acquirePage(browser: Browser): Promise<Page> {
  const MAX_ATTEMPTS = 10;
  const DELAY_MS = 250;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const contexts = browser.contexts();
    const existingContextPage = await acquireFromExistingContexts(contexts);
    if (existingContextPage.page) {
      return existingContextPage.page;
    }
    lastError = existingContextPage.lastError ?? lastError;

    if (contexts.length === 0 || existingContextPage.lastError) {
      try {
        const context = await browser.newContext();
        const newPage = await context.newPage();
        log(`Created new page in fresh context (attempt ${attempt + 1})`);
        return newPage;
      } catch (err) {
        lastError = toError(err);
      }
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      log(`Page acquisition attempt ${attempt + 1}/${MAX_ATTEMPTS} failed, retrying in ${DELAY_MS}ms...`);
      await new Promise<void>((r) => setTimeout(r, DELAY_MS));
    }
  }

  throw new Error(
    `Connected to CDP but could not acquire a usable page. Is Lightpanda running and ready?` +
    (lastError ? ` Last error: ${lastError.message}` : '')
  );
}

async function acquireFromExistingContexts(
  contexts: BrowserContext[]
): Promise<{ page: Page | null; lastError?: Error }> {
  let lastError: Error | undefined;

  for (const [contextIndex, context] of contexts.entries()) {
    try {
      const freshPage = await context.newPage();
      log(`Created fresh page in existing context ${contextIndex + 1}/${contexts.length}`);
      return { page: freshPage };
    } catch (err) {
      lastError = toError(err);
    }

    const pages = context.pages();
    for (const [pageIndex, candidate] of pages.entries()) {
      if (typeof candidate.isClosed === 'function' && candidate.isClosed()) {
        continue;
      }

      try {
        await candidate.title();
        log(
          `Reusing validated page ${pageIndex + 1}/${pages.length} from context ${contextIndex + 1}/${contexts.length}`
        );
        return { page: candidate };
      } catch (err) {
        lastError = toError(err);
      }
    }
  }

  return { page: null, lastError };
}

async function connectWithRetry(config: Config): Promise<Browser> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.cdpRetryAttempts; attempt++) {
    try {
      return await chromium.connectOverCDP(config.cdpEndpoint, {
        timeout: CDP_CONNECT_TIMEOUT_MS,
      });
    } catch (err) {
      lastError = toError(err);
      if (attempt < config.cdpRetryAttempts) {
        const delay = config.cdpRetryDelayMs * Math.pow(2, attempt - 1);
        logCritical(
          `CDP connection attempt ${attempt}/${config.cdpRetryAttempts} failed, retrying in ${delay}ms...`
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to connect to CDP at ${config.cdpEndpoint} after ${config.cdpRetryAttempts} attempts: ${lastError?.message}\n` +
    `  - Is Lightpanda running? Try: lightpanda serve --host ${config.host} --port ${config.port}\n` +
    `  - Is the port correct? Check LIGHTPANDA_HOST and LIGHTPANDA_PORT env vars.`
  );
}

const listenedPages = new WeakSet<Page>();
const listenedBrowsers = new WeakSet<Browser>();
const expectedDisconnects = new WeakSet<Browser>();

function attachBrowserListeners(browser: Browser): void {
  if (listenedBrowsers.has(browser)) return;
  listenedBrowsers.add(browser);

  browser.on('disconnected', () => {
    const expected = expectedDisconnects.has(browser);
    if (expected) {
      expectedDisconnects.delete(browser);
    } else {
      addErrorLog({
        message: 'Browser disconnected',
        timestamp: Date.now(),
      });
    }
    setPage(null);
    setBrowser(null);
    if (!expected) {
      logCritical('Browser disconnected from CDP');
    }
  });
}

function markExpectedDisconnect(browser: Browser): void {
  expectedDisconnects.add(browser);
}

const requestIdMap = new WeakMap<Request, string>();
const requestTimestamps = new Map<string, number>();
let nextRequestId = 0;

export function attachListeners(page: Page): void {
  if (listenedPages.has(page)) return;
  listenedPages.add(page);

  page.on('console', (msg) => {
    const text = msg.text();

    // Detect structured error messages from our instrumentation
    if (msg.type() === 'error' && text.startsWith('{"_pb":')) {
      try {
        const data = JSON.parse(text);
        if (data._pb === 'error') {
          addErrorLog({
            message: data.msg,
            stack: data.stack,
            source: data.source,
            line: data.line,
            col: data.col,
            type: 'exception',
            timestamp: Date.now(),
          });
          return; // Don't add to console buffer
        }
        if (data._pb === 'rejection') {
          addErrorLog({
            message: data.reason,
            stack: data.stack,
            type: 'rejection',
            timestamp: Date.now(),
          });
          return;
        }
        if (data._pb === 'framework-error') {
          const VALID_FRAMEWORKS = ['react', 'vue', 'angular'] as const;
          type Framework = typeof VALID_FRAMEWORKS[number];
          const fw: Framework | undefined = VALID_FRAMEWORKS.includes(data.framework) ? data.framework : undefined;
          if (!fw) {
            log(`Unrecognized framework error source: ${String(data.framework)}`);
          }
          addErrorLog({
            message: data.msg,
            type: 'framework',
            framework: fw,
            timestamp: Date.now(),
          });
          return;
        }
      } catch {
        // Not our structured message, fall through to normal console log
      }
    }

    addConsoleLog({
      level: msg.type(),
      text,
      timestamp: Date.now(),
    });
  });

  page.on('request', (req) => {
    const id = `req-${++nextRequestId}`;
    const now = Date.now();
    requestIdMap.set(req, id);
    requestTimestamps.set(id, now);
    startNetworkRequest(id, {
      requestId: id,
      method: req.method(),
      url: req.url(),
      timestamp: now,
    });
  });

  page.on('response', (res) => {
    const req = res.request();
    const id = requestIdMap.get(req);
    if (id) {
      const startTime = requestTimestamps.get(id);
      completeNetworkRequest(id, {
        status: res.status(),
        contentType: res.headers()['content-type'],
        durationMs: startTime ? Date.now() - startTime : undefined,
      });
      requestTimestamps.delete(id);
    }
  });

  page.on('requestfailed', (req) => {
    const id = requestIdMap.get(req);
    if (id) {
      completeNetworkRequest(id, {
        failed: true,
        failureReason: req.failure()?.errorText,
      });
      requestTimestamps.delete(id);
    } else {
      // Fallback: request event was missed
      const fallbackId = `req-${++nextRequestId}`;
      startNetworkRequest(fallbackId, {
        requestId: fallbackId,
        method: req.method(),
        url: req.url(),
        timestamp: Date.now(),
        failed: true,
        failureReason: req.failure()?.errorText,
      });
    }
  });

  page.on('pageerror', (error) => {
    addErrorLog({
      message: error.message,
      stack: error.stack,
      type: 'exception',
      timestamp: Date.now(),
    });
  });

  page.on('crash', () => {
    addErrorLog({
      message: 'Page crashed',
      timestamp: Date.now(),
    });
  });
}
