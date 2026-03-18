import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage, setNavigated } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { checkDomain } from '../util/domain-filter.js';
import { resolveElementTarget } from '../util/element-target.js';

export function registerBrowserClick(server: McpServer): void {
  server.tool(
    'browser_click',
    'Click an element on the page by CSS selector, text selector, or elementId from browser_interactive_elements',
    {
      selector: z.string().optional().describe('CSS selector or Playwright text selector (e.g. "text=Submit")'),
      elementId: z.string().optional().describe('elementId returned by browser_interactive_elements'),
      waitUntil: z.enum(['none', 'domcontentloaded', 'load', 'networkidle']).optional()
        .describe('How long to wait after clicking (defaults to domcontentloaded)'),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ selector, elementId, waitUntil }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const target = resolveElementTarget(page.url(), selector, elementId);
        const waitMode = waitUntil ?? 'domcontentloaded';

        const navPromise = waitMode === 'none'
          ? Promise.resolve()
          : page.waitForNavigation({
              waitUntil: waitMode,
              timeout: config.defaultTimeout,
            }).catch(() => {});

        await page.click(target.selector, { timeout: config.defaultTimeout });
        await navPromise;
        if (page.url() !== 'about:blank') setNavigated(true);

        const domainCheck = checkDomain(page.url(), config);
        if (domainCheck.blocked) {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: config.defaultTimeout }).catch(() => {});
          return { content: [{ type: 'text', text: domainCheck.reason! }], isError: true };
        }

        const title = await page.title();
        const text = formatToolResponse(`Clicked: ${target.label}\nPage title: ${title}`, config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error clicking ${elementId ?? selector ?? '<missing target>'}: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
