import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getErrorLogs, clearErrorLogs, getPage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse, capArray } from '../util/output.js';

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
      const config = getConfig();
      const allLogs = getErrorLogs();
      if (clear) clearErrorLogs();

      if (allLogs.length === 0) {
        return { content: [{ type: 'text', text: 'No errors captured.' }] };
      }

      const { items: logs, omitted } = capArray(allLogs, config.outputMaxElements);
      let output = logs.map((l) => {
        const typeLabel = l.type === 'framework'
          ? `${l.framework ?? 'framework'}-error`
          : l.type === 'rejection' ? 'rejection' : 'error';
        let location = '';
        if (l.source) {
          location = ` (${l.source}`;
          if (l.line !== undefined) location += `:${l.line}`;
          if (l.col !== undefined) location += `:${l.col}`;
          location += ')';
        }
        let line = `[${typeLabel}] ${l.message}${location}`;
        if (l.stack) line += `\n${l.stack}`;
        return line;
      }).join('\n\n');
      if (omitted > 0) output += `\n... [${omitted} more errors omitted]`;

      const text = formatToolResponse(output, config, getPage()?.url());
      return { content: [{ type: 'text', text }] };
    }
  );
}
