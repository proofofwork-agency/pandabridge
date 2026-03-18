import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNetworkLogs, clearNetworkLogs, getPage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse, capArray } from '../util/output.js';
import { toErrorMessage } from '../util/errors.js';

export function registerBrowserNetworkRequests(server: McpServer): void {
  server.tool(
    'browser_network_requests',
    'Get HTTP requests with status codes, content types, timing, and failure reasons.',
    {
      clear: z.boolean().optional().describe('Clear logs after reading (defaults to false)'),
      filter: z.string().optional().describe('Filter entries by URL substring'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    async ({ clear, filter }) => {
      try {
        const config = getConfig();
        let allLogs = getNetworkLogs();
        if (clear) clearNetworkLogs();

        if (filter) {
          allLogs = allLogs.filter((l) => l.url.includes(filter));
        }

        if (allLogs.length === 0) {
          return { content: [{ type: 'text', text: filter ? `No network activity matching "${filter}".` : 'No network activity captured.' }] };
        }

        const { items: logs, omitted } = capArray(allLogs, config.outputMaxElements);
        let output = logs.map((l) => {
          if (l.failed) {
            const reason = l.failureReason ? ` (${l.failureReason})` : '';
            return `${l.method} ${l.url} FAILED${reason}`;
          }
          const status = l.status !== undefined ? ` ${l.status}` : '';
          const ct = l.contentType ? ` (${l.contentType})` : '';
          const duration = l.durationMs !== undefined ? ` ${l.durationMs}ms` : '';
          return `${l.method} ${l.url}${status}${ct}${duration}`;
        }).join('\n');
        if (omitted > 0) output += `\n... [${omitted} more entries omitted]`;

        const text = formatToolResponse(output, config, getPage()?.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Network requests error: ${toErrorMessage(err)}` }], isError: true };
      }
    }
  );
}
