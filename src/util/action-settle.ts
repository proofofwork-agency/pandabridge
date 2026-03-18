import type { Page } from 'playwright-core';

export async function waitForSettle(page: Page, timeoutMs: number = 1500): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout: timeoutMs });
  } catch {
    // Timeout expected — returns immediately if no pending network, caps at timeoutMs
  }
}
