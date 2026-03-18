import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse, capArray } from '../util/output.js';

export function registerBrowserDomQuery(server: McpServer): void {
  server.tool(
    'browser_dom_query',
    'Query DOM elements by CSS selector. Returns element details, attributes, or properties without needing browser_evaluate.',
    {
      selector: z.string().describe('CSS selector to query'),
      attribute: z.string().optional().describe('Get a specific attribute value (e.g., href, class, data-id)'),
      property: z.string().optional().describe('Get a DOM property (e.g., value, checked, innerText, innerHTML)'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ selector, attribute, property }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();

        if (attribute) {
          const values = await page.evaluate(
            ({ sel, attr, max }: { sel: string; attr: string; max: number }) => {
              const els = Array.from(document.querySelectorAll(sel)).slice(0, max);
              return els.map((el) => ({
                tag: el.tagName.toLowerCase(),
                value: el.getAttribute(attr),
              }));
            },
            { sel: selector, attr: attribute, max: config.outputMaxElements }
          );

          if (values.length === 0) {
            return { content: [{ type: 'text', text: `No elements found for: ${selector}` }] };
          }

          const output = values.map((v) =>
            `<${v.tag}> ${attribute}=${v.value !== null ? `"${v.value}"` : 'null'}`
          ).join('\n');
          const text = formatToolResponse(output, config, page.url());
          return { content: [{ type: 'text', text }] };
        }

        if (property) {
          const values = await page.evaluate(
            ({ sel, prop, max }: { sel: string; prop: string; max: number }) => {
              const els = Array.from(document.querySelectorAll(sel)).slice(0, max);
              return els.map((el) => ({
                tag: el.tagName.toLowerCase(),
                value: String((el as any)[prop] ?? 'undefined'),
              }));
            },
            { sel: selector, prop: property, max: config.outputMaxElements }
          );

          if (values.length === 0) {
            return { content: [{ type: 'text', text: `No elements found for: ${selector}` }] };
          }

          const output = values.map((v) =>
            `<${v.tag}> ${property}=${JSON.stringify(v.value)}`
          ).join('\n');
          const text = formatToolResponse(output, config, page.url());
          return { content: [{ type: 'text', text }] };
        }

        // Default: element summary
        const summaries = await page.evaluate(
          ({ sel, max }: { sel: string; max: number }) => {
            const els = Array.from(document.querySelectorAll(sel)).slice(0, max);
            return els.map((el) => {
              const tag = el.tagName.toLowerCase();
              const id = el.id ? `#${el.id}` : '';
              const classes = el.className && typeof el.className === 'string'
                ? '.' + el.className.trim().split(/\s+/).join('.')
                : '';
              const text = (el.textContent || '').trim().slice(0, 80);
              const attrs: string[] = [];
              for (const attr of ['href', 'src', 'type', 'name', 'role', 'aria-label'] as const) {
                const val = el.getAttribute(attr);
                if (val) attrs.push(`${attr}="${val}"`);
              }
              return { tag, id, classes, text, attrs: attrs.join(' ') };
            });
          },
          { sel: selector, max: config.outputMaxElements }
        );

        if (summaries.length === 0) {
          return { content: [{ type: 'text', text: `No elements found for: ${selector}` }] };
        }

        const totalCount = await page.evaluate(
          (sel: string) => document.querySelectorAll(sel).length,
          selector
        );

        let output = summaries.map((s) => {
          let line = `<${s.tag}${s.id}${s.classes}>`;
          if (s.attrs) line += ` ${s.attrs}`;
          if (s.text) line += ` "${s.text}"`;
          return line;
        }).join('\n');

        if (totalCount > summaries.length) {
          output += `\n... [${totalCount - summaries.length} more elements]`;
        }

        const text = formatToolResponse(output, config, page.url());
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `DOM query error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
