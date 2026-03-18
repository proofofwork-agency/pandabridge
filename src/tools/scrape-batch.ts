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
import { formatToolResponse } from '../util/output.js';
import { checkDomain } from '../util/domain-filter.js';
import { getPostNavigationDomainError } from '../util/post-navigation-domain.js';
import { toErrorMessage } from '../util/errors.js';
import { isRecoverableNavigationError } from '../util/recoverable-error.js';
import { createReconnectFresh } from '../util/reconnect.js';

export const scrapeBatchDeps = {
  ensurePage,
  hasNavigated,
  reconnectFresh: createReconnectFresh,
};

export function registerScrapeBatch(server: McpServer): void {
  server.tool(
    'scrape_batch',
    'Scrape multiple URLs sequentially. Returns markdown content for each page. Partial failures are reported inline without aborting the batch.',
    {
      urls: z.array(z.string()).min(1).describe('URLs to scrape sequentially'),
      waitFor: z.string().optional().describe('CSS selector to wait for on each page'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ urls, waitFor }) => {
      try {
        const config = getConfig();

        if (urls.length > config.batchMaxUrls) {
          return {
            content: [{ type: 'text', text: `Batch too large: ${urls.length} URLs exceeds maximum of ${config.batchMaxUrls}. Set PANDABRIDGE_BATCH_MAX_URLS to increase.` }],
            isError: true,
          };
        }

        const total = urls.length;
        const sections: string[] = [];

        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];

          const domainCheck = checkDomain(url, config);
          if (domainCheck.blocked) {
            sections.push(`### [${i + 1}/${total}] ${url}\n**FAILED:** ${domainCheck.reason}`);
            continue;
          }

          try {
            clearConsoleLogs();
            clearNetworkLogs();
            clearErrorLogs();

            if (scrapeBatchDeps.hasNavigated()) {
              await scrapeBatchDeps.reconnectFresh(config);
            }

            const page = await scrapeBatchDeps.ensurePage();

            try {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.defaultTimeout });
            } catch (err) {
              if (!(err instanceof Error) || !isRecoverableNavigationError(err)) {
                throw err;
              }
              await scrapeBatchDeps.reconnectFresh(config);
              const retryPage = await scrapeBatchDeps.ensurePage();
              await retryPage.goto(url, { waitUntil: 'domcontentloaded', timeout: config.defaultTimeout });
            }

            setNavigated(true);

            const activePage = await scrapeBatchDeps.ensurePage();
            const redirectedDomainError = getPostNavigationDomainError(url, activePage.url(), config);
            if (redirectedDomainError) {
              sections.push(`### [${i + 1}/${total}] ${url}\n**FAILED:** ${redirectedDomainError}`);
              await scrapeBatchDeps.reconnectFresh(config);
              continue;
            }

            if (waitFor) {
              await activePage.waitForSelector(waitFor, { state: 'visible', timeout: config.defaultTimeout });
            }

            const title = await activePage.title();
            const html = await activePage.innerHTML('body');
            const md = turndown.turndown(html);

            const linkCount: number = await activePage.evaluate(() =>
              document.querySelectorAll('a[href]').length
            );

            sections.push(`### [${i + 1}/${total}] ${url}\n**Title:** ${title} | **Links:** ${linkCount}\n\n${md}`);
          } catch (err) {
            sections.push(`### [${i + 1}/${total}] ${url}\n**FAILED:** ${toErrorMessage(err)}`);
          }
        }

        const output = sections.join('\n\n---\n\n');
        const text = formatToolResponse(output, config);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Batch scrape error: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
