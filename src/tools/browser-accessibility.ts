import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { toErrorMessage } from '../util/errors.js';

export function registerBrowserAccessibility(server: McpServer): void {
  server.tool(
    'browser_accessibility',
    'Get a DOM-inferred accessibility summary of the page. Walks the DOM and reads ARIA attributes, roles, and text content — not the browser\'s computed accessibility tree. Useful for a quick structural overview, but may differ from assistive technology behavior.',
    {
      root: z.string().optional().describe('CSS selector for the root element (defaults to entire page)'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ root }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();

        // Use Playwright's built-in aria snapshot for a simpler approach
        // Falls back to CDP if needed
        let output: string;
        try {
          // Try using page.evaluate to build an a11y-like tree from ARIA attributes
          output = await page.evaluate((rootSelector?: string) => {
            const rootEl = rootSelector
              ? document.querySelector(rootSelector)
              : document.body;
            if (!rootEl) return 'No element found.';

            function getRole(el: Element): string {
              return el.getAttribute('role') ||
                     (el as HTMLElement).tagName?.toLowerCase() || 'unknown';
            }

            function walk(el: Element, depth: number): string {
              const role = getRole(el);
              const name = el.getAttribute('aria-label') ||
                           el.getAttribute('alt') ||
                           el.getAttribute('title') ||
                           (el.children.length === 0 ? (el.textContent || '').trim().slice(0, 60) : '');
              const prefix = '  '.repeat(depth);
              const nameStr = name ? ` "${name}"` : '';
              const level = el.getAttribute('aria-level');
              const levelStr = level ? ` (level=${level})` : '';
              const lines = [`${prefix}${role}${nameStr}${levelStr}`];
              for (const child of el.children) {
                lines.push(walk(child, depth + 1));
              }
              return lines.join('\n');
            }

            return walk(rootEl, 0);
          }, root);
        } catch {
          output = 'Accessibility tree is not available.';
        }

        const text = formatToolResponse(output, config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const message = toErrorMessage(err);
        if (message.includes('not supported') || message.includes('not implemented')) {
          return { content: [{ type: 'text', text: 'Accessibility tree is not supported by this browser.' }] };
        }
        return {
          content: [{ type: 'text', text: `Accessibility error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
