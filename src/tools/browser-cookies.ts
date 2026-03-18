import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse, capArray } from '../util/output.js';
import { toErrorMessage } from '../util/errors.js';

function redactValue(val: string): string {
  if (val.length <= 8) return val.slice(0, 2) + '***';
  return val.slice(0, 4) + '***' + val.slice(-2);
}

export function registerBrowserCookies(server: McpServer): void {
  server.tool(
    'browser_cookies',
    'Manage browser cookies: get, set, or delete cookies for debugging auth and session issues.',
    {
      action: z.enum(['get', 'set', 'delete']).describe('Action to perform'),
      name: z.string().optional().describe('Cookie name (required for set, optional filter for get/delete)'),
      value: z.string().optional().describe('Cookie value (required for set)'),
      domain: z.string().optional().describe('Cookie domain'),
      url: z.string().optional().describe('URL to associate cookie with (alternative to domain for set)'),
      path: z.string().optional().describe('Cookie path'),
    },
    {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
    async ({ action, name, value, domain, url: cookieUrl, path }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();
        const context = page.context();

        if (action === 'get') {
          const allCookies = await context.cookies();
          const filtered = name
            ? allCookies.filter((c) => c.name === name)
            : allCookies;

          if (filtered.length === 0) {
            return { content: [{ type: 'text', text: name ? `No cookies matching "${name}".` : 'No cookies found.' }] };
          }

          const { items: cookies, omitted } = capArray(filtered, config.outputMaxElements);
          let output = cookies.map((c) =>
            `${c.name}=${redactValue(c.value)} | domain=${c.domain} | path=${c.path} | secure=${c.secure} | httpOnly=${c.httpOnly}` +
            (c.expires !== -1 ? ` | expires=${new Date(c.expires * 1000).toISOString()}` : '')
          ).join('\n');
          if (omitted > 0) output += `\n... [${omitted} more cookies omitted]`;

          const text = formatToolResponse(output, config, page.url());
          return { content: [{ type: 'text', text }] };
        }

        if (action === 'set') {
          if (!name || value === undefined) {
            return { content: [{ type: 'text', text: 'Cookie name and value are required for set action.' }], isError: true };
          }
          if (!cookieUrl && !domain) {
            return { content: [{ type: 'text', text: 'Either url or domain is required for set action.' }], isError: true };
          }
          const cookie: { name: string; value: string; url?: string; domain?: string; path?: string } = { name, value };
          if (cookieUrl) cookie.url = cookieUrl;
          if (domain) cookie.domain = domain;
          if (path) cookie.path = path;
          await context.addCookies([cookie]);
          return { content: [{ type: 'text', text: `Cookie "${name}" set successfully.` }] };
        }

        if (action === 'delete') {
          if (name || domain) {
            const clearOptions: { name?: string; domain?: string } = {};
            if (name) clearOptions.name = name;
            if (domain) clearOptions.domain = domain;
            await context.clearCookies(clearOptions as Parameters<typeof context.clearCookies>[0]);
            const desc = [name && `name="${name}"`, domain && `domain="${domain}"`].filter(Boolean).join(', ');
            return { content: [{ type: 'text', text: `Cookies cleared (${desc}).` }] };
          }
          await context.clearCookies();
          return { content: [{ type: 'text', text: 'All cookies cleared.' }] };
        }

        return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Cookie error: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
