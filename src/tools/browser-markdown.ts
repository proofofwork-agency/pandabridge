import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { turndown } from '../util/turndown.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';

export function registerBrowserMarkdown(server: McpServer): void {
  server.tool(
    'browser_markdown',
    'Get page content as structured markdown with headings, links, lists. Uses stable HTML extraction plus Turndown conversion.',
    { selector: z.string().optional().describe('CSS selector to extract (defaults to body)') },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ selector }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const sel = selector || 'body';
        const html = await page.innerHTML(sel);
        const md = turndown.turndown(html);

        const text = formatToolResponse(md, config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error extracting markdown: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
