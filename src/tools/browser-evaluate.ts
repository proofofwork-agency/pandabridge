import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage, getErrorLogs } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { formatErrorLogs } from '../util/format-logs.js';

export function registerBrowserEvaluate(server: McpServer): void {
  server.tool(
    'browser_evaluate',
    'Execute JavaScript in the page context. Disabled by default. For safe DOM queries, use browser_dom_query instead.',
    { expression: z.string().describe('JavaScript expression to evaluate') },
    {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ expression }) => {
      try {
        const config = getConfig();
        if (!config.evaluateEnabled) {
          return {
            content: [{ type: 'text', text: 'browser_evaluate is disabled via PANDABRIDGE_EVALUATE_ENABLED=false' }],
            isError: true,
          };
        }
        const page = await ensurePage();
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Evaluation timed out')), config.defaultTimeout);
          page.evaluate(expression).then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
          );
        });
        const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

        const text = formatToolResponse(output ?? 'undefined', config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        const name = e.name && e.name !== 'Error' ? e.name : 'EvaluationError';
        let msg = `${name}: ${e.message}`;
        if (e.stack) {
          const stackLines = e.stack.split('\n').slice(1).join('\n');
          if (stackLines.trim()) msg += `\n${stackLines}`;
        }

        // Wait briefly for async CDP instrumentation events to arrive
        await new Promise<void>((r) => setTimeout(r, 500));
        const instrErrors = getErrorLogs();
        if (instrErrors.length > 0) {
          msg += `\n\nInstrumentation errors:\n${formatErrorLogs(instrErrors, instrErrors.length)}`;
        }

        return {
          content: [{ type: 'text', text: msg }],
          isError: true,
        };
      }
    }
  );
}
