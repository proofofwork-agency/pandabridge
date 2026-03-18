import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getErrorLogs, clearErrorLogs, getPage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { toErrorMessage } from '../util/errors.js';
import { formatErrorLogs } from '../util/format-logs.js';

export function registerBrowserErrors(server: McpServer): void {
  server.tool(
    'browser_errors',
    'Get uncaught JS exceptions and promise rejections with stack traces and source locations. Check this after navigation if a page seems broken.',
    { clear: z.boolean().optional().describe('Clear errors after reading (defaults to false)') },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    async ({ clear }) => {
      try {
        const config = getConfig();
        const allLogs = getErrorLogs();
        if (clear) clearErrorLogs();

        if (allLogs.length === 0) {
          return { content: [{ type: 'text', text: 'No errors captured.' }] };
        }

        const output = formatErrorLogs(allLogs, config.outputMaxElements);
        const text = formatToolResponse(output, config, getPage()?.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Browser errors error: ${toErrorMessage(err)}` }], isError: true };
      }
    }
  );
}
