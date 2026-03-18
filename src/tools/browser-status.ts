import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBrowser, getPage, hasNavigated } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';

export function registerBrowserStatus(server: McpServer): void {
  server.tool(
    'browser_status',
    'Check browser connection status, current URL, and page title',
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    async () => {
      try {
        const config = getConfig();
        const browser = getBrowser();
        const page = getPage();

        if (!browser) {
          const text = formatToolResponse(
            'Status: disconnected\nNo browser connected. Use browser_navigate to connect.',
            config
          );
          return { content: [{ type: 'text', text }] };
        }

        const connected = browser.isConnected();
        if (!connected) {
          const text = formatToolResponse(
            'Status: disconnected\nBrowser connection lost. Use browser_navigate to reconnect.',
            config
          );
          return { content: [{ type: 'text', text }] };
        }

        if (!page) {
          const text = formatToolResponse(
            `Status: connected (no page)\nCDP endpoint: ${config.cdpEndpoint}\nNo active page. Use browser_navigate to open a URL.`,
            config
          );
          return { content: [{ type: 'text', text }] };
        }

        if (!hasNavigated()) {
          const text = formatToolResponse(
            `Status: connected (ready)\nCDP endpoint: ${config.cdpEndpoint}\nURL: ${page.url()}\nPage is ready for first navigation.`,
            config
          );
          return { content: [{ type: 'text', text }] };
        }

        // Check page liveness
        let alive = false;
        try {
          await page.evaluate('1');
          alive = true;
        } catch {
          // page is stale
        }

        if (!alive) {
          const text = formatToolResponse(
            `Status: connected (stale page)\nCDP endpoint: ${config.cdpEndpoint}\nPage is unresponsive. Use browser_navigate to open a new URL.`,
            config
          );
          return { content: [{ type: 'text', text }] };
        }

        const url = page.url();
        const title = await page.title();
        const text = formatToolResponse(
          `Status: connected\nCDP endpoint: ${config.cdpEndpoint}\nURL: ${url}\nTitle: ${title}`,
          config
        );
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error checking status: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
