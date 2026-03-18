import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { resolveElementTarget } from '../util/element-target.js';

export function registerBrowserScroll(server: McpServer): void {
  server.tool(
    'browser_scroll',
    'Scroll the page or a specific element',
    {
      direction: z.enum(['up', 'down']).optional().describe('Scroll direction (defaults to down)'),
      amount: z.number().optional().describe('Scroll amount in pixels (defaults to 500)'),
      selector: z.string().optional().describe('CSS selector of element to scroll (defaults to page)'),
      elementId: z.string().optional().describe('elementId returned by browser_interactive_elements'),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ direction, amount, selector, elementId }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const dir = direction || 'down';
        const pixels = amount || 500;
        const scrollY = dir === 'down' ? pixels : -pixels;
        const target = selector || elementId ? resolveElementTarget(page.url(), selector, elementId) : null;

        if (target) {
          await page.evaluate(
            ({ sel, y }: { sel: string; y: number }) => {
              const el = document.querySelector(sel);
              if (!el) throw new Error(`Element not found: ${sel}`);
              el.scrollBy(0, y);
            },
            { sel: target.selector, y: scrollY }
          );
        } else {
          await page.evaluate((y: number) => window.scrollBy(0, y), scrollY);
        }

        const targetLabel = target?.label || 'page';
        const text = formatToolResponse(`Scrolled ${dir} ${pixels}px on ${targetLabel}`, config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error scrolling: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
