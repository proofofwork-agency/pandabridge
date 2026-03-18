import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  clearConsoleLogs,
  clearNetworkLogs,
  clearErrorLogs,
  ensurePage,
  hasNavigated,
  setNavigated,
} from '../browser/state.js';
import { turndown } from '../util/turndown.js';
import { getConfig } from '../config.js';
import { formatToolResponse, capArray } from '../util/output.js';
import { checkDomain } from '../util/domain-filter.js';
import { injectErrorInstrumentation } from '../browser/instrumentation.js';
import { getPostNavigationDomainError } from '../util/post-navigation-domain.js';

export const scrapePageDeps = {
  ensurePage,
  hasNavigated,
  reconnectFresh: async (config: ReturnType<typeof getConfig>) => {
    const { reconnectFresh } = await import('../browser/connection.js');
    await reconnectFresh(config);
  },
};

function isRecoverableNavigationError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('target page, context or browser has been closed') ||
    message.includes('browser has been closed') ||
    message.includes('connection closed') ||
    message.includes('target closed') ||
    message.includes('econnrefused')
  );
}

export function registerScrapePage(server: McpServer): void {
  server.tool(
    'scrape_page',
    'Navigate to a URL and extract its content in one call. Returns page title, markdown body, and all links. Primary tool for web research and content extraction.',
    {
      url: z.string().describe('URL to scrape'),
      waitFor: z.string().optional().describe('CSS selector to wait for before extracting'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ url, waitFor }) => {
      try {
        const config = getConfig();

        const domainCheck = checkDomain(url, config);
        if (domainCheck.blocked) {
          return { content: [{ type: 'text', text: domainCheck.reason! }], isError: true };
        }

        clearConsoleLogs();
        clearNetworkLogs();
        clearErrorLogs();

        if (scrapePageDeps.hasNavigated()) {
          await scrapePageDeps.reconnectFresh(config);
        }

        const page = await scrapePageDeps.ensurePage();

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.defaultTimeout });
        } catch (err) {
          if (!(err instanceof Error) || !isRecoverableNavigationError(err)) {
            throw err;
          }
          await scrapePageDeps.reconnectFresh(config);
          const retryPage = await scrapePageDeps.ensurePage();
          await retryPage.goto(url, { waitUntil: 'domcontentloaded', timeout: config.defaultTimeout });
        }

        setNavigated(true);

        const activePage = await scrapePageDeps.ensurePage();
        const redirectedDomainError = getPostNavigationDomainError(url, activePage.url(), config);
        if (redirectedDomainError) {
          await scrapePageDeps.reconnectFresh(config);
          return { content: [{ type: 'text', text: redirectedDomainError }], isError: true };
        }

        if (waitFor) {
          await activePage.waitForSelector(waitFor, { state: 'visible', timeout: config.defaultTimeout });
        }

        try {
          await injectErrorInstrumentation(activePage);
        } catch {
          // best-effort
        }

        const title = await activePage.title();
        const html = await activePage.innerHTML('body');
        const md = turndown.turndown(html);

        const allLinks: { text: string; href: string }[] = await activePage.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'), (a) => ({
            text: (a as HTMLAnchorElement).textContent?.trim() || '',
            href: (a as HTMLAnchorElement).href,
          }))
        );

        const { items: links, omitted } = capArray(allLinks, config.outputMaxElements);
        let linkList = links.map((l) => `- ${l.text} → ${l.href}`).join('\n');
        if (omitted > 0) linkList += `\n... [${omitted} more links omitted]`;

        let output = `# ${title}\n\n${md}\n\n## Links (${allLinks.length})`;
        if (links.length > 0) output += `\n${linkList}`;

        const text = formatToolResponse(output, config, activePage.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error scraping ${url}: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
