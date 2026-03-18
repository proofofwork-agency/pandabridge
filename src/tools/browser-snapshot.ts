import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { toErrorMessage } from '../util/errors.js';

export function registerBrowserSnapshot(server: McpServer): void {
  server.tool(
    'browser_snapshot',
    "Get the page's visible text content. Best for quickly checking what a page shows. Faster and smaller than browser_markdown. Use this first.",
    {
      selector: z.string().min(1).optional().describe('CSS selector (defaults to body)'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ selector }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const sel = selector ?? 'body';

        const content = await page.innerText(sel);
        const title = await page.title();
        const url = page.url();

        // Collapse excessive whitespace
        const compact = content.replace(/\n{3,}/g, '\n\n').trim();

        let elementCount = 0;
        try {
          elementCount = await page.evaluate(
            (s: string) => document.querySelectorAll(s + ' *').length,
            sel
          );
        } catch {
          // element count is cosmetic — don't crash if selector is malformed
        }

        const header = `Page: ${title} | ${url} | ${elementCount} elements`;
        const output = `${header}\n---\n${compact}`;

        const text = formatToolResponse(output, config, url);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error getting snapshot: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
