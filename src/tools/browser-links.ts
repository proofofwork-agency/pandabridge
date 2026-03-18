import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse, capArray } from '../util/output.js';

export function registerBrowserLinks(server: McpServer): void {
  server.tool(
    'browser_links',
    'Extract links from the current page. Optional filter and domain params narrow results for crawl discovery.',
    {
      filter: z.string().optional().describe('Substring to match against href — only matching links returned'),
      domain: z.string().optional().describe('Domain filter — only links from this domain returned'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ filter, domain }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const allLinks = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'), (a) => ({
            text: (a as HTMLAnchorElement).textContent?.trim() || '',
            href: (a as HTMLAnchorElement).href,
          }))
        );

        let filtered = allLinks;
        if (filter) filtered = filtered.filter((l) => l.href.includes(filter));
        if (domain) filtered = filtered.filter((l) => {
          try {
            const h = new URL(l.href).hostname;
            return h === domain || h.endsWith('.' + domain);
          } catch {
            return false;
          }
        });

        const { items: links, omitted } = capArray(filtered, config.outputMaxElements);
        let output = links.map((l) => `${l.text} → ${l.href}`).join('\n');
        if (omitted > 0) output += `\n... [${omitted} more links omitted]`;

        const text = formatToolResponse(output || 'No links found.', config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error extracting links: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
