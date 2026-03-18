import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage, registerInteractiveElements } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse, capArray } from '../util/output.js';

interface ElementInfo {
  tag: string;
  elementId?: string;
  selector: string;
  id?: string;
  name?: string;
  type?: string;
  role?: string;
  href?: string;
  placeholder?: string;
  text?: string;
}

export function formatElementLine(
  i: number,
  el: { tag: string; selector: string; elementId?: string; text?: string; type?: string;
        placeholder?: string; href?: string; role?: string }
): string {
  const attrs: string[] = [];
  if (el.type) attrs.push(`type=${el.type}`);
  if (el.placeholder) attrs.push(`placeholder="${el.placeholder}"`);
  if (el.href) attrs.push(`href=${el.href}`);
  if (el.role) attrs.push(`role=${el.role}`);
  const attrStr = attrs.length > 0 ? ` (${attrs.join(', ')})` : '';
  const textStr = el.text ? ` "${el.text}"` : '';
  let displaySelector: string;
  if (el.selector.startsWith('#')) {
    displaySelector = `${el.tag}${el.selector}`;
  } else if (el.selector.startsWith(el.tag + '[')) {
    displaySelector = `${el.tag}${el.selector.slice(el.tag.length)}`;
  } else {
    displaySelector = el.selector;
  }
  const idStr = el.elementId ? ` ${el.elementId}` : '';
  return `[${i + 1}]${idStr} ${displaySelector}${textStr}${attrStr}`;
}

export function registerBrowserInteractiveElements(server: McpServer): void {
  server.tool(
    'browser_interactive_elements',
    'List all interactive elements (buttons, links, inputs, selects) on the page in compact tabular format',
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async () => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const allElements: ElementInfo[] = await page.evaluate(() => {
          const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [onclick]';
          const els = document.querySelectorAll(selectors);
          return Array.from(els, (el) => {
            const tag = el.tagName.toLowerCase();
            const id = el.id || undefined;
            const name = el.getAttribute('name') || undefined;
            const type = el.getAttribute('type') || undefined;
            const role = el.getAttribute('role') || undefined;
            const href = (el as HTMLAnchorElement).href || undefined;
            const placeholder = el.getAttribute('placeholder') || undefined;
            const text = el.textContent?.trim().slice(0, 100) || undefined;

            let selector: string;
            if (id) {
              const escaped = id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
              selector = `#${escaped}`;
            } else if (name) {
              const escapedName = name.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
              selector = `${tag}[name="${escapedName}"]`;
            } else {
              // Build unique path using nth-child (counts all sibling types correctly)
              function nthChildPath(element: Element): string {
                const parent = element.parentElement;
                if (!parent || parent === document.documentElement) return element.tagName.toLowerCase();
                const siblings = Array.from(parent.children);
                const idx = siblings.indexOf(element) + 1;
                const parentPath = parent === document.body ? 'body' : nthChildPath(parent);
                return `${parentPath} > ${element.tagName.toLowerCase()}:nth-child(${idx})`;
              }
              selector = nthChildPath(el);
            }

            return { tag, selector, id, name, type, role, href, placeholder, text };
          });
        });

        const { items: elements, omitted } = capArray(allElements, config.outputMaxElements);
        const pageUrl = page.url();
        const registeredElements = registerInteractiveElements(
          pageUrl,
          elements.map((element) => ({ selector: element.selector, tag: element.tag }))
        );

        // Compact tabular format
        const lines = elements.map((el, i) =>
          formatElementLine(i, { ...el, elementId: registeredElements[i]?.id })
        );

        let output = lines.join('\n');
        if (omitted > 0) output += `\n... [${omitted} more elements omitted]`;
        if (output) {
          output = `Use elementId values with browser_click, browser_type, browser_select_option, or browser_wait_for.\n${output}`;
        }

        const text = formatToolResponse(output || 'No interactive elements found.', config, pageUrl);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error getting interactive elements: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
