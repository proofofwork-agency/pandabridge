import type { Page } from 'playwright-core';

export interface DomTargetInfo {
  exists: boolean;
  tagName?: string;
  isContentEditable?: boolean;
  disabled?: boolean;
  error?: string;
}

export async function inspectDomTarget(page: Page, selector: string): Promise<DomTargetInfo> {
  return page.evaluate((sel) => {
    try {
      const element = document.querySelector(sel);
      if (!element) {
        return { exists: false };
      }

      const htmlElement = element as HTMLElement & { disabled?: boolean };
      return {
        exists: true,
        tagName: element.tagName.toLowerCase(),
        isContentEditable: htmlElement.isContentEditable,
        disabled: typeof htmlElement.disabled === 'boolean' ? htmlElement.disabled : false,
      };
    } catch (err) {
      return {
        exists: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, selector);
}
