import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  clearConsoleLogs,
  clearNetworkLogs,
  clearErrorLogs,
  ensurePage,
  hasNavigated,
  setNavigated,
  getErrorLogs,
  getConsoleLogs,
  getNetworkLogs,
} from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { checkDomain } from '../util/domain-filter.js';
import { injectErrorInstrumentation } from '../browser/instrumentation.js';
import { getPostNavigationDomainError } from '../util/post-navigation-domain.js';
import { toErrorMessage } from '../util/errors.js';
import { isRecoverableNavigationError } from '../util/recoverable-error.js';
import { createReconnectFresh } from '../util/reconnect.js';

export const navigateDeps = {
  ensurePage,
  hasNavigated,
  reconnectFresh: createReconnectFresh,
};

async function navigateOnce(
  url: string,
  timeout: number
): Promise<{ page: Awaited<ReturnType<typeof ensurePage>>; status: number; title: string }> {
  const page = await navigateDeps.ensurePage();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  setNavigated(true);
  let title = '';
  try { title = await page.title(); } catch { /* context may be destroyed by client-side redirect */ }
  return {
    page,
    status: response?.status() ?? 0,
    title,
  };
}

export function registerBrowserNavigate(server: McpServer): void {
  server.tool(
    'browser_navigate',
    'Navigate to a URL. Returns page title, HTTP status, and a page summary. Each navigation creates a fresh browser session.',
    { url: z.string().describe('The URL to navigate to') },
    {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ url }) => {
      try {
        const config = getConfig();

        // Domain filtering
        const domainCheck = checkDomain(url, config);
        if (domainCheck.blocked) {
          return { content: [{ type: 'text', text: domainCheck.reason }], isError: true };
        }

        clearConsoleLogs();
        clearNetworkLogs();
        clearErrorLogs();

        // Lightpanda is currently more reliable when each top-level navigation
        // starts from a fresh CDP session instead of reusing an already-navigated page.
        if (navigateDeps.hasNavigated()) {
          await navigateDeps.reconnectFresh(config);
        }

        let result;
        try {
          result = await navigateOnce(url, config.defaultTimeout);
        } catch (err) {
          if (!(err instanceof Error) || !isRecoverableNavigationError(err)) {
            throw err;
          }

          await navigateDeps.reconnectFresh(config);
          result = await navigateOnce(url, config.defaultTimeout);
        }

        const redirectedDomainError = getPostNavigationDomainError(url, result.page.url(), config);
        if (redirectedDomainError) {
          await navigateDeps.reconnectFresh(config);
          return { content: [{ type: 'text', text: redirectedDomainError }], isError: true };
        }

        // Inject error instrumentation (graceful if LP doesn't support it)
        try {
          await injectErrorInstrumentation(result.page);
        } catch {
          // Instrumentation is best-effort
        }

        // Gather summary counts
        const errorCount = getErrorLogs().length;
        const consoleCount = getConsoleLogs().length;
        const networkCount = getNetworkLogs().length;

        // Page text preview
        let preview = '';
        try {
          const bodyText = await result.page.innerText('body');
          preview = bodyText.replace(/\s+/g, ' ').trim().slice(0, 500);
        } catch {
          // Preview is best-effort
        }

        let output = `Navigated to: ${url}\nTitle: ${result.title}\nStatus: ${result.status}`;
        output += `\nErrors: ${errorCount} | Console: ${consoleCount} | Network: ${networkCount}`;
        if (preview) output += `\n---\nPreview: ${preview}`;

        const text = formatToolResponse(output, config, result.page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error navigating to ${url}: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
