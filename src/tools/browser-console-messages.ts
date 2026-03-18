import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConsoleLogs, clearConsoleLogs, getPage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse, capArray } from '../util/output.js';

export function registerBrowserConsoleMessages(server: McpServer): void {
  server.tool(
    'browser_console_messages',
    'Get console output from page JS. For uncaught exceptions use browser_errors instead.',
    { clear: z.boolean().optional().describe('Clear logs after reading (defaults to false)') },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    async ({ clear }) => {
      const config = getConfig();
      const allLogs = getConsoleLogs();
      if (clear) clearConsoleLogs();

      if (allLogs.length === 0) {
        return { content: [{ type: 'text', text: 'No console messages captured.' }] };
      }

      const { items: logs, omitted } = capArray(allLogs, config.outputMaxElements);
      let output = logs.map((l) => `[${l.level}] ${l.text}`).join('\n');
      if (omitted > 0) output += `\n... [${omitted} more messages omitted]`;

      const text = formatToolResponse(output, config, getPage()?.url());
      return { content: [{ type: 'text', text }] };
    }
  );
}
