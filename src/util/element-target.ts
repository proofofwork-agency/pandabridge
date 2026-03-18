import { resolveInteractiveElement } from '../browser/state.js';

export interface ResolvedElementTarget {
  selector: string;
  label: string;
}

export function resolveElementTarget(
  pageUrl: string,
  selector?: string,
  elementId?: string
): ResolvedElementTarget {
  if (elementId) {
    const resolved = resolveInteractiveElement(elementId, pageUrl);
    if (!resolved) {
      throw new Error(
        `Unknown elementId "${elementId}". Call browser_interactive_elements on the current page and use a fresh ID.`
      );
    }
    return {
      selector: resolved.selector,
      label: `${elementId} (${resolved.tag})`,
    };
  }

  if (!selector) {
    throw new Error('Provide either "selector" or "elementId".');
  }

  return {
    selector,
    label: selector,
  };
}
