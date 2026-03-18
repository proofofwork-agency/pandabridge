import type { Page } from 'playwright-core';
import { ACTION_SETTLE_TIMEOUT_MS } from './constants.js';

export async function waitForSettle(page: Page, timeoutMs: number = ACTION_SETTLE_TIMEOUT_MS): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout: timeoutMs });
  } catch {
    // Timeout expected — returns immediately if no pending network, caps at timeoutMs
  }
}
