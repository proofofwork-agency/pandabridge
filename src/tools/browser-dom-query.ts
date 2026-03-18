import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { toErrorMessage } from '../util/errors.js';

const SAFE_DOM_PROPERTIES = new Set([
  'value', 'checked', 'selected', 'disabled', 'readOnly',
  'innerText', 'textContent', 'innerHTML', 'outerHTML',
  'id', 'className', 'tagName', 'nodeName', 'nodeType',
  'childElementCount', 'scrollTop', 'scrollLeft',
  'offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight',
  'hidden', 'draggable', 'contentEditable',
  'href', 'src', 'alt', 'title', 'placeholder', 'type', 'name',
]);

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
      openWorldHint: false,
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
          if (!SAFE_DOM_PROPERTIES.has(property)) {
            return {
              content: [{ type: 'text', text: `Property "${property}" is not in the allowed list. Allowed: ${[...SAFE_DOM_PROPERTIES].sort().join(', ')}` }],
              isError: true,
            };
          }

          const values = await page.evaluate(
            ({ sel, prop, max }: { sel: string; prop: string; max: number }) => {
              const els = Array.from(document.querySelectorAll(sel)).slice(0, max);
              return els.map((el) => ({
                tag: el.tagName.toLowerCase(),
                value: String((el as unknown as Record<string, unknown>)[prop] ?? 'undefined'),
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

        // Default: element summary (single evaluate returns both summaries and totalCount)
        const { summaries, totalCount } = await page.evaluate(
          ({ sel, max }: { sel: string; max: number }) => {
            const allEls = document.querySelectorAll(sel);
            const totalCount = allEls.length;
            const els = Array.from(allEls).slice(0, max);
            return {
              totalCount,
              summaries: els.map((el) => {
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
              }),
            };
          },
          { sel: selector, max: config.outputMaxElements }
        );

        if (summaries.length === 0) {
          return { content: [{ type: 'text', text: `No elements found for: ${selector}` }] };
        }

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
          content: [{ type: 'text', text: `DOM query error: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
