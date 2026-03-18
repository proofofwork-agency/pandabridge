import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { resolveElementTarget } from '../util/element-target.js';
import { toErrorMessage } from '../util/errors.js';

export function registerBrowserWaitFor(server: McpServer): void {
  server.tool(
    'browser_wait_for',
    'Wait for an element to reach a specific state by selector or elementId',
    {
      selector: z.string().min(1).optional().describe('CSS selector to wait for'),
      elementId: z.string().optional().describe('elementId returned by browser_interactive_elements'),
      state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional().describe('State to wait for (defaults to visible)'),
      timeout: z.number().optional().describe('Timeout in milliseconds'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ selector, elementId, state, timeout }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const target = resolveElementTarget(page.url(), selector, elementId);
        const waitState = state ?? 'visible';
        const waitTimeout = timeout ?? config.defaultTimeout;

        await page.waitForSelector(target.selector, { state: waitState, timeout: waitTimeout });

        const text = formatToolResponse(`Element ${target.label} is ${waitState}`, config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Timeout waiting for ${elementId ?? selector ?? '<missing target>'}: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
