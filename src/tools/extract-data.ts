import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';

export function registerExtractData(server: McpServer): void {
  server.tool(
    'extract_data',
    'Extract structured data from the current page using a CSS selector. Returns JSON array of matching elements with tag, text, and requested attributes.',
    {
      selector: z.string().describe('CSS selector — all matching elements extracted'),
      attributes: z.array(z.string()).optional().describe('HTML attributes to collect (e.g. ["href", "data-price"])'),
      limit: z.coerce.number().int().min(1).optional().describe('Max elements to return (default: config.outputMaxElements)'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ selector, attributes, limit }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();

        const max = Math.min(limit ?? config.outputMaxElements, config.outputMaxElements);
        const attrs = attributes ?? [];

        const results = await page.evaluate(
          ({ sel, attrs, max }: { sel: string; attrs: string[]; max: number }) => {
            const els = Array.from(document.querySelectorAll(sel)).slice(0, max);
            return els.map((el) => {
              const item: Record<string, string | null> = {
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || '').trim().slice(0, 200),
              };
              for (const attr of attrs) {
                item[attr] = el.getAttribute(attr);
              }
              return item;
            });
          },
          { sel: selector, attrs, max }
        );

        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `No elements found for selector: ${selector}` }],
          };
        }

        const output = JSON.stringify(results, null, 2);
        const text = formatToolResponse(output, config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Extract data error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
