import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { waitForSettle } from '../util/action-settle.js';
import { toErrorMessage } from '../util/errors.js';
import { ACTION_SETTLE_TIMEOUT_MS } from '../util/constants.js';

export function registerBrowserPressKey(server: McpServer): void {
  server.tool(
    'browser_press_key',
    'Press a keyboard key (e.g. Enter, Tab, Escape, ArrowDown)',
    { key: z.string().describe('Key to press (e.g. "Enter", "Tab", "Escape", "ArrowDown")') },
    {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ key }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        await page.keyboard.press(key);
        await waitForSettle(page, Math.min(config.defaultTimeout, ACTION_SETTLE_TIMEOUT_MS));

        const text = formatToolResponse(`Pressed key: ${key}`, config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error pressing key ${key}: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
