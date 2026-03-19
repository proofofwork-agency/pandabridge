import type { Page } from 'playwright-core';

export interface DomTargetInfo {
  exists: boolean;
  tagName?: string;
  inputType?: string;
  isContentEditable?: boolean;
  disabled?: boolean;
  error?: string;
}

// Lightpanda crashes on HTML5 validation input types (email, url, tel, search,
// number, date, etc.) due to unimplemented Web APIs triggered by page JS.
// Downgrade to type="text" before filling — safe because we don't need
// browser-side validation; the server validates on submit.
const FRAGILE_INPUT_TYPES = new Set([
  'email', 'url', 'tel', 'search', 'number',
  'date', 'datetime-local', 'month', 'week', 'time',
]);

export async function downgradeFragileInputType(
  page: Page,
  selector: string,
  domTarget: DomTargetInfo,
): Promise<void> {
  if (domTarget.inputType && FRAGILE_INPUT_TYPES.has(domTarget.inputType)) {
    await page.evaluate(
      ([sel, origType]) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (el) {
          el.setAttribute('type', 'text');
          el.setAttribute('data-original-type', origType);
        }
      },
      [selector, domTarget.inputType] as const,
    );
  }
}

export async function inspectDomTarget(page: Page, selector: string): Promise<DomTargetInfo> {
  return page.evaluate((sel) => {
    try {
      const element = document.querySelector(sel);
      if (!element) {
        return { exists: false };
      }

      const htmlElement = element as HTMLElement & { disabled?: boolean };
      const inputEl = element as HTMLInputElement;
      return {
        exists: true,
        tagName: element.tagName.toLowerCase(),
        inputType: element.tagName.toLowerCase() === 'input' ? (inputEl.type || 'text') : undefined,
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
