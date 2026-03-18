import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBrowser, getPage, hasNavigated, getErrorLogs, getConsoleLogs, getNetworkLogs } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatErrorLogs, formatConsoleLogs, formatNetworkLogs } from '../util/format-logs.js';

export function registerAllResources(server: McpServer): void {
  server.resource(
    'errors',
    'pandabridge://errors',
    { description: 'Current JavaScript error logs', mimeType: 'text/plain' },
    async () => ({
      contents: [{
        uri: 'pandabridge://errors',
        text: formatErrorLogs(getErrorLogs(), getConfig().outputMaxElements),
        mimeType: 'text/plain',
      }],
    })
  );

  server.resource(
    'console',
    'pandabridge://console',
    { description: 'Current console output logs', mimeType: 'text/plain' },
    async () => ({
      contents: [{
        uri: 'pandabridge://console',
        text: formatConsoleLogs(getConsoleLogs(), getConfig().outputMaxElements),
        mimeType: 'text/plain',
      }],
    })
  );

  server.resource(
    'network',
    'pandabridge://network',
    { description: 'Current network request log summary', mimeType: 'text/plain' },
    async () => ({
      contents: [{
        uri: 'pandabridge://network',
        text: formatNetworkLogs(getNetworkLogs(), getConfig().outputMaxElements),
        mimeType: 'text/plain',
      }],
    })
  );

  server.resource(
    'status',
    'pandabridge://status',
    { description: 'Browser connection status, URL, and title', mimeType: 'text/plain' },
    async () => {
      const config = getConfig();
      const browser = getBrowser();
      const page = getPage();

      let status: string;
      if (!browser || !browser.isConnected()) {
        status = 'Status: disconnected';
      } else if (!page) {
        status = `Status: connected (no page)\nCDP endpoint: ${config.cdpEndpoint}`;
      } else if (!hasNavigated()) {
        status = `Status: connected (ready)\nCDP endpoint: ${config.cdpEndpoint}\nURL: ${page.url()}`;
      } else {
        const url = page.url();
        let title = '';
        try { title = await page.title(); } catch { /* stale page */ }
        status = `Status: connected\nCDP endpoint: ${config.cdpEndpoint}\nURL: ${url}\nTitle: ${title}`;
      }

      return {
        contents: [{
          uri: 'pandabridge://status',
          text: status,
          mimeType: 'text/plain',
        }],
      };
    }
  );
}
