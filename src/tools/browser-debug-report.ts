import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  clearConsoleLogs,
  clearNetworkLogs,
  clearErrorLogs,
  ensurePage,
  hasNavigated,
  setNavigated,
  getErrorLogs,
  getConsoleLogs,
  getNetworkLogs,
} from '../browser/state.js';
import { getConfig } from '../config.js';
import { formatToolResponse } from '../util/output.js';
import { checkDomain } from '../util/domain-filter.js';
import { injectErrorInstrumentation } from '../browser/instrumentation.js';
import { waitForSettle } from '../util/action-settle.js';
import { inspectDomTarget, downgradeFragileInputType } from '../util/dom-target.js';
import { getPostNavigationDomainError } from '../util/post-navigation-domain.js';
import { toErrorMessage } from '../util/errors.js';
import { log } from '../log.js';
import { isRecoverableNavigationError } from '../util/recoverable-error.js';
import { formatErrorLogLine } from '../util/format-logs.js';
import { createReconnectFresh } from '../util/reconnect.js';
import { ACTION_SETTLE_TIMEOUT_MS, REPORT_SECTION_MAX_ITEMS } from '../util/constants.js';
import type { Page } from 'playwright-core';
import type { NetworkEntry } from '../browser/state.js';

function isBadRequest(n: NetworkEntry): boolean {
  return !!(n.failed || (n.status !== undefined && n.status >= 400));
}

async function validateAndPrepareActionTarget(
  page: Awaited<ReturnType<typeof ensurePage>>,
  action: z.infer<typeof ActionSchema>
): Promise<string | null> {
  if (action.type !== 'type' && action.type !== 'select') {
    return null;
  }

  const domTarget = await inspectDomTarget(page, action.selector);
  if (domTarget.error) {
    return `Invalid selector ${action.selector}: ${domTarget.error}`;
  }
  if (!domTarget.exists) {
    return `No element matches ${action.selector} on the current page.`;
  }
  if (domTarget.disabled) {
    return `Element ${action.selector} is disabled.`;
  }
  if (
    action.type === 'type' &&
    domTarget.tagName !== 'input' &&
    domTarget.tagName !== 'textarea' &&
    !domTarget.isContentEditable
  ) {
    return `Element ${action.selector} is <${domTarget.tagName ?? 'unknown'}>; browser_type only supports input, textarea, or contenteditable elements.`;
  }
  if (action.type === 'select' && domTarget.tagName !== 'select') {
    return `Element ${action.selector} is <${domTarget.tagName ?? 'unknown'}>; browser_select_option only supports <select> elements.`;
  }

  if (action.type === 'type') {
    await downgradeFragileInputType(page, action.selector, domTarget);
  }

  return null;
}

export const debugReportDeps = {
  ensurePage,
  hasNavigated,
  reconnectFresh: createReconnectFresh,
};

const ActionSchema = z.object({
  type: z.enum(['click', 'type', 'select', 'press_key']),
  selector: z.string().describe('CSS selector, text selector, or key name for press_key'),
  value: z.string().optional().describe('Value for type/select actions'),
});

export function registerBrowserDebugReport(server: McpServer): void {
  server.tool(
    'browser_debug_report',
    'Navigate to a URL, optionally perform actions, and return a compact diagnostic report with errors, failed requests, and console issues. Use this for one-shot page diagnosis instead of calling multiple tools.',
    {
      url: z.string().describe('URL to diagnose'),
      symptom: z.string().optional().describe('What seems wrong (e.g. "checkout button does nothing")'),
      actions: z.array(ActionSchema).optional().describe('Steps to reproduce the issue'),
    },
    {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async ({ url, symptom, actions }) => {
      try {
        const config = getConfig();

        // Domain filtering
        const domainCheck = checkDomain(url, config);
        if (domainCheck.blocked) {
          return { content: [{ type: 'text' as const, text: domainCheck.reason }], isError: true };
        }

        // 1. Clear all logs and reconnect fresh if needed
        clearConsoleLogs();
        clearNetworkLogs();
        clearErrorLogs();

        if (debugReportDeps.hasNavigated()) {
          await debugReportDeps.reconnectFresh(config);
        }

        // 2. Navigate
        let page: Page | undefined;
        let status = 0;
        try {
          page = await debugReportDeps.ensurePage();
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.defaultTimeout });
          setNavigated(true);
          status = response?.status() ?? 0;
        } catch (err) {
          if (!(err instanceof Error) || !isRecoverableNavigationError(err)) throw err;
          await debugReportDeps.reconnectFresh(config);
          page = await debugReportDeps.ensurePage();
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.defaultTimeout });
          setNavigated(true);
          status = response?.status() ?? 0;
        }

        const redirectedDomainError = getPostNavigationDomainError(url, page.url(), config);
        if (redirectedDomainError) {
          await debugReportDeps.reconnectFresh(config);
          return { content: [{ type: 'text' as const, text: redirectedDomainError }], isError: true };
        }

        // 3. Inject error instrumentation
        try {
          await injectErrorInstrumentation(page);
        } catch {
          // Best-effort
        }

        // 4. Initial settle
        await waitForSettle(page, 500);

        // 5. Execute actions
        const actionResults: string[] = [];
        if (actions && actions.length > 0) {
          for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            const preErrors = getErrorLogs().length;
            const preFailedRequests = getNetworkLogs().filter(isBadRequest).length;

            let actionError: string | null = null;
            try {
              actionError = await validateAndPrepareActionTarget(page, action);
              if (actionError) {
                throw new Error(actionError);
              }

              switch (action.type) {
                case 'click':
                  await page.click(action.selector, { timeout: config.defaultTimeout });
                  break;
                case 'type':
                  await page.fill(action.selector, action.value ?? '', { timeout: config.defaultTimeout });
                  break;
                case 'select':
                  await page.selectOption(action.selector, action.value ?? '', { timeout: config.defaultTimeout });
                  break;
                case 'press_key':
                  await page.keyboard.press(action.selector);
                  break;
              }
            } catch (err) {
              actionError = toErrorMessage(err);
            }

            await waitForSettle(page, ACTION_SETTLE_TIMEOUT_MS);

            const newErrors = getErrorLogs().length - preErrors;
            const newFailedRequests = getNetworkLogs().filter(isBadRequest).length - preFailedRequests;

            const actionLabel = action.type === 'type' || action.type === 'select'
              ? `${action.type} ${action.selector} "${action.value ?? ''}"`
              : `${action.type} ${action.selector}`;

            if (actionError) {
              actionResults.push(`${i + 1}. ${actionLabel} → ERROR: ${actionError}`);
            } else {
              const deltas: string[] = [];
              if (newErrors > 0) deltas.push(`${newErrors} new error${newErrors > 1 ? 's' : ''}`);
              if (newFailedRequests > 0) deltas.push(`${newFailedRequests} failed request${newFailedRequests > 1 ? 's' : ''}`);
              actionResults.push(`${i + 1}. ${actionLabel} → ${deltas.length > 0 ? deltas.join(', ') : 'OK'}`);
            }
          }
        }

        // 6. Collect final state
        const errors = getErrorLogs();
        const failedRequests = getNetworkLogs().filter(isBadRequest);
        const consoleIssues = getConsoleLogs().filter(c => c.level === 'error' || c.level === 'warning');

        let title = '';
        try { title = await page.title(); } catch { log('Failed to retrieve page title (stale page)'); }

        let preview = '';
        try {
          const bodyText = await page.innerText('body');
          preview = bodyText.replace(/\s+/g, ' ').trim().slice(0, 200);
        } catch { log('Failed to retrieve page preview (stale page)'); }

        // 7. Format report
        const lines: string[] = [];
        lines.push(`=== Debug Report: ${url} ===`);
        if (symptom) lines.push(`Symptom: "${symptom}"`);
        lines.push('');

        lines.push('## Page State');
        lines.push(`Title: ${title || '(none)'} | Status: ${status}`);
        if (preview) lines.push(`Preview: ${preview}`);
        lines.push('');

        if (actionResults.length > 0) {
          lines.push(`## Actions (${actionResults.length} performed)`);
          lines.push(...actionResults);
          lines.push('');
        }

        if (errors.length > 0) {
          lines.push(`## Errors (${errors.length})`);
          const capped = errors.slice(0, REPORT_SECTION_MAX_ITEMS);
          for (const e of capped) {
            lines.push(formatErrorLogLine(e, false));
          }
          if (errors.length > REPORT_SECTION_MAX_ITEMS) lines.push(`... [${errors.length - REPORT_SECTION_MAX_ITEMS} more errors omitted]`);
          lines.push('');
        }

        if (failedRequests.length > 0) {
          lines.push(`## Failed/Error Requests (${failedRequests.length})`);
          const capped = failedRequests.slice(0, REPORT_SECTION_MAX_ITEMS);
          for (const r of capped) {
            if (r.failed) {
              const reason = r.failureReason ? ` (${r.failureReason})` : '';
              lines.push(`${r.method} ${r.url} FAILED${reason}`);
            } else {
              lines.push(`${r.method} ${r.url} ${r.status}`);
            }
          }
          if (failedRequests.length > REPORT_SECTION_MAX_ITEMS) lines.push(`... [${failedRequests.length - REPORT_SECTION_MAX_ITEMS} more entries omitted]`);
          lines.push('');
        }

        if (consoleIssues.length > 0) {
          lines.push(`## Console Issues (${consoleIssues.length})`);
          const capped = consoleIssues.slice(0, REPORT_SECTION_MAX_ITEMS);
          for (const c of capped) {
            lines.push(`[${c.level}] ${c.text}`);
          }
          if (consoleIssues.length > REPORT_SECTION_MAX_ITEMS) lines.push(`... [${consoleIssues.length - REPORT_SECTION_MAX_ITEMS} more entries omitted]`);
          lines.push('');
        }

        if (errors.length === 0 && failedRequests.length === 0 && consoleIssues.length === 0) {
          lines.push('No errors, failed/error requests, or console issues detected.');
          lines.push('');
        }

        const output = lines.join('\n');
        const text = formatToolResponse(output, config, page.url());
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error generating debug report for ${url}: ${toErrorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );
}
