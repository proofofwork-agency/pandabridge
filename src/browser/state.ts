import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { Config } from '../config.js';
import { getConfig } from '../config.js';
import { checkDomain } from '../util/domain-filter.js';
import { logCritical } from '../log.js';

export class DomainBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainBlockedError';
  }
}

export interface ConsoleEntry {
  level: string;
  text: string;
  timestamp: number;
}

export interface NetworkEntry {
  requestId: string;
  method: string;
  url: string;
  status?: number;
  contentType?: string;
  timestamp: number;
  durationMs?: number;
  failed?: boolean;
  failureReason?: string;
}

export interface ErrorEntry {
  message: string;
  stack?: string;
  timestamp: number;
  source?: string;
  line?: number;
  col?: number;
  type?: 'exception' | 'rejection' | 'framework';
  framework?: 'react' | 'vue' | 'angular';
}

export interface InteractiveElementEntry {
  id: string;
  selector: string;
  tag: string;
}

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let consoleLogs: ConsoleEntry[] = [];
let networkLogs: NetworkEntry[] = [];
let errorLogs: ErrorEntry[] = [];
let logBufferMax = 500;
let navigated = false;
let reconnecting: Promise<void> | null = null;
let interactiveElementsPageUrl: string | null = null;
let interactiveElements = new Map<string, InteractiveElementEntry>();
let interactiveElementsVersion = 0;

export function initState(config: Config): void {
  logBufferMax = config.logBufferMax;
}

export function getBrowser(): Browser | null {
  return browser;
}

export function setBrowser(b: Browser | null): void {
  browser = b;
}

export function getPage(): Page | null {
  return page;
}

export function getContext(): BrowserContext | null {
  return context;
}

export function setContext(c: BrowserContext | null): void {
  context = c;
}

/**
 * Set the active page. Call `attachListeners(page)` from connection.ts
 * BEFORE calling setPage() when page is non-null to ensure console/network
 * listeners are registered.
 */
export function setPage(p: Page | null): void {
  interactiveElementsPageUrl = null;
  interactiveElements = new Map();
  page = p;
  if (!p) {
    context = null;
    navigated = false;
  }
}

export function hasNavigated(): boolean {
  return navigated;
}

export function setNavigated(value: boolean): void {
  if (value) {
    interactiveElementsPageUrl = null;
    interactiveElements = new Map();
  }
  navigated = value;
}

export function registerInteractiveElements(
  pageUrl: string,
  elements: Array<{ selector: string; tag: string }>
): InteractiveElementEntry[] {
  interactiveElementsVersion += 1;
  interactiveElementsPageUrl = pageUrl;
  interactiveElements = new Map(
    elements.map((element, index) => {
      const entry: InteractiveElementEntry = {
        id: `e${interactiveElementsVersion}-${index + 1}`,
        selector: element.selector,
        tag: element.tag,
      };
      return [entry.id, entry];
    })
  );
  return Array.from(interactiveElements.values());
}

export function resolveInteractiveElement(id: string, currentPageUrl: string): InteractiveElementEntry | null {
  if (!interactiveElementsPageUrl || interactiveElementsPageUrl !== currentPageUrl) {
    return null;
  }
  return interactiveElements.get(id) ?? null;
}

export async function ensurePage(): Promise<Page> {
  if (page) {
    // Pre-navigation: Lightpanda's initial page can't evaluate JS.
    // Trust it — the first goto() will initialize the runtime.
    if (!navigated) {
      return page;
    }

    // Post-navigation: evaluate as health check
    try {
      await page.evaluate('1');
      const config = getConfig();
      const domainResult = checkDomain(page.url(), config);
      if (domainResult.blocked) {
        throw new DomainBlockedError(
          `Page is on a restricted domain (${page.url()}). ${domainResult.reason}`
        );
      }
      return page;
    } catch (err) {
      if (err instanceof DomainBlockedError) throw err;
      logCritical('Stale page detected, attempting reconnection...');
      setPage(null);
      setBrowser(null);
    }
  }

  // Attempt reconnection via dynamic imports to avoid circular deps
  if (!reconnecting) {
    reconnecting = (async () => {
      const { connectAndSetup } = await import('./connection.js');
      await connectAndSetup(getConfig());
    })();
  }

  try {
    await reconnecting;
  } catch (err) {
    throw new Error(
      `No active page and reconnection failed: ${err instanceof Error ? err.message : String(err)}. Use browser_navigate first.`
    );
  } finally {
    reconnecting = null;
  }

  if (!page) {
    throw new Error('No active page after reconnection. Use browser_navigate first to navigate to a URL.');
  }
  return page;
}

export function addConsoleLog(entry: ConsoleEntry): void {
  consoleLogs.push(entry);
  if (consoleLogs.length > logBufferMax) {
    consoleLogs.splice(0, consoleLogs.length - logBufferMax);
  }
}

export function getConsoleLogs(): ConsoleEntry[] {
  return [...consoleLogs];
}

export function clearConsoleLogs(): void {
  consoleLogs = [];
}

const networkMap = new Map<string, NetworkEntry>();

export function startNetworkRequest(id: string, entry: NetworkEntry): void {
  networkMap.set(id, entry);
  networkLogs.push(entry);
  if (networkLogs.length > logBufferMax) {
    // Trim both the array and the map
    const removed = networkLogs.splice(0, networkLogs.length - logBufferMax);
    for (const r of removed) networkMap.delete(r.requestId);
  }
}

export function completeNetworkRequest(id: string, updates: Partial<NetworkEntry>): void {
  const entry = networkMap.get(id);
  if (entry) {
    const updated = { ...entry, ...updates };
    networkMap.set(id, updated);
    const idx = networkLogs.indexOf(entry);
    if (idx !== -1) networkLogs[idx] = updated;
  }
}

export function getNetworkLogs(): NetworkEntry[] {
  return [...networkLogs];
}

export function clearNetworkLogs(): void {
  networkLogs = [];
  networkMap.clear();
}

export function addErrorLog(entry: ErrorEntry): void {
  // Dedup: skip if any of the last 3 entries has the same message within 100ms
  const recentStart = Math.max(0, errorLogs.length - 3);
  for (let i = recentStart; i < errorLogs.length; i++) {
    const prev = errorLogs[i];
    if (prev.message === entry.message && Math.abs(prev.timestamp - entry.timestamp) <= 100) {
      return;
    }
  }

  errorLogs.push(entry);
  if (errorLogs.length > logBufferMax) {
    errorLogs.splice(0, errorLogs.length - logBufferMax);
  }
}

export function getErrorLogs(): ErrorEntry[] {
  return [...errorLogs];
}

export function clearErrorLogs(): void {
  errorLogs = [];
}
