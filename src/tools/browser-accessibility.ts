import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ensurePage } from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse, truncateText } from '../util/output.js';

interface AXNode {
  role?: { value?: string };
  name?: { value?: string };
  level?: { value?: number };
  children?: AXNode[];
  childIds?: string[];
  nodeId?: string;
  [key: string]: unknown;
}

interface FlatAXNode {
  role: string;
  name: string;
  level?: number;
  children: FlatAXNode[];
}

function flattenTree(nodes: AXNode[]): FlatAXNode | null {
  if (nodes.length === 0) return null;

  const nodeMap = new Map<string, AXNode>();
  for (const n of nodes) {
    if (n.nodeId) nodeMap.set(n.nodeId, n);
  }

  function build(node: AXNode): FlatAXNode {
    const role = node.role?.value || 'unknown';
    const name = node.name?.value || '';
    const children: FlatAXNode[] = [];
    if (node.childIds) {
      for (const id of node.childIds) {
        const child = nodeMap.get(id);
        if (child) children.push(build(child));
      }
    }
    if (node.children) {
      for (const child of node.children) {
        children.push(build(child));
      }
    }
    return { role, name, level: node.level?.value, children };
  }

  return build(nodes[0]);
}

function formatTree(node: FlatAXNode, indent: number = 0): string {
  const prefix = '  '.repeat(indent);
  const name = node.name ? ` "${node.name}"` : '';
  const level = node.level !== undefined ? ` (level=${node.level})` : '';
  const lines = [`${prefix}${node.role}${name}${level}`];
  for (const child of node.children) {
    lines.push(formatTree(child, indent + 1));
  }
  return lines.join('\n');
}

export function registerBrowserAccessibility(server: McpServer): void {
  server.tool(
    'browser_accessibility',
    'Get a DOM-inferred accessibility summary of the page. Walks the DOM and reads ARIA attributes, roles, and text content — not the browser\'s computed accessibility tree. Useful for a quick structural overview, but may differ from assistive technology behavior.',
    {
      root: z.string().optional().describe('CSS selector for the root element (defaults to entire page)'),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ root }) => {
      try {
        const config = getConfig();
        const page = await ensurePage();

        // Use Playwright's built-in aria snapshot for a simpler approach
        // Falls back to CDP if needed
        let output: string;
        try {
          // Try using page.evaluate to build an a11y-like tree from ARIA attributes
          output = await page.evaluate((rootSelector?: string) => {
            const rootEl = rootSelector
              ? document.querySelector(rootSelector)
              : document.body;
            if (!rootEl) return 'No element found.';

            function getRole(el: Element): string {
              return el.getAttribute('role') ||
                     (el as HTMLElement).tagName?.toLowerCase() || 'unknown';
            }

            function walk(el: Element, depth: number): string {
              const role = getRole(el);
              const name = el.getAttribute('aria-label') ||
                           el.getAttribute('alt') ||
                           el.getAttribute('title') ||
                           (el.children.length === 0 ? (el.textContent || '').trim().slice(0, 60) : '');
              const prefix = '  '.repeat(depth);
              const nameStr = name ? ` "${name}"` : '';
              const level = el.getAttribute('aria-level');
              const levelStr = level ? ` (level=${level})` : '';
              const lines = [`${prefix}${role}${nameStr}${levelStr}`];
              for (const child of el.children) {
                lines.push(walk(child, depth + 1));
              }
              return lines.join('\n');
            }

            return walk(rootEl, 0);
          }, root);
        } catch {
          output = 'Accessibility tree is not available.';
        }

        const text = formatToolResponse(
          truncateText(output, config.outputMaxChars - 200),
          config,
          page.url()
        );
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const message = (err as Error).message;
        if (message.includes('not supported') || message.includes('not implemented')) {
          return { content: [{ type: 'text', text: 'Accessibility tree is not supported by this browser.' }] };
        }
        return {
          content: [{ type: 'text', text: `Accessibility error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
