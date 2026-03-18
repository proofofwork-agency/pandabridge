import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { resolveElementTarget } from '../util/element-target.js';
import { waitForSettle } from '../util/action-settle.js';
import { inspectDomTarget } from '../util/dom-target.js';
import { toErrorMessage } from '../util/errors.js';
import { ACTION_SETTLE_TIMEOUT_MS } from '../util/constants.js';

export function registerBrowserSelectOption(server: McpServer): void {
  server.tool(
    'browser_select_option',
    'Select an option from a dropdown/select element by selector or elementId',
    {
      selector: z.string().optional().describe('CSS selector for the select element'),
      elementId: z.string().optional().describe('elementId returned by browser_interactive_elements'),
      value: z.string().describe('Value of the option to select'),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ selector, elementId, value }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const target = resolveElementTarget(page.url(), selector, elementId);
        const domTarget = await inspectDomTarget(page, target.selector);
        if (domTarget.error) {
          throw new Error(`Invalid selector ${target.label}: ${domTarget.error}`);
        }
        if (!domTarget.exists) {
          throw new Error(`No element matches ${target.label} on the current page.`);
        }
        if (domTarget.disabled) {
          throw new Error(`Element ${target.label} is disabled.`);
        }
        if (domTarget.tagName !== 'select') {
          throw new Error(
            `Element ${target.label} is <${domTarget.tagName ?? 'unknown'}>; browser_select_option only supports <select> elements.`
          );
        }

        const selected = await page.selectOption(target.selector, value, { timeout: config.defaultTimeout });
        await waitForSettle(page, Math.min(config.defaultTimeout, ACTION_SETTLE_TIMEOUT_MS));

        const text = formatToolResponse(
          `Selected "${value}" in ${target.label} → [${selected.join(', ')}]`,
          config,
          page.url()
        );
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error selecting option on ${elementId ?? selector ?? '<missing target>'}: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
