import type { ErrorEntry, ConsoleEntry, NetworkEntry } from '../browser/state.js';
import { capArray } from './output.js';

export function formatErrorLogLine(l: ErrorEntry, includeStack = true): string {
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
  const base = `[${typeLabel}] ${l.message}${location}`;
  return includeStack && l.stack ? base + `\n${l.stack}` : base;
}

export function formatErrorLogs(logs: ErrorEntry[], maxElements: number): string {
  if (logs.length === 0) return 'No errors captured.';

  const { items, omitted } = capArray(logs, maxElements);
  const base = items.map((l) => formatErrorLogLine(l)).join('\n\n');
  return omitted > 0 ? base + `\n... [${omitted} more errors omitted]` : base;
}

export function formatConsoleLogs(logs: ConsoleEntry[], maxElements: number): string {
  if (logs.length === 0) return 'No console messages captured.';

  const { items, omitted } = capArray(logs, maxElements);
  const base = items.map((l) => `[${l.level}] ${l.text}`).join('\n');
  return omitted > 0 ? base + `\n... [${omitted} more messages omitted]` : base;
}

export function formatNetworkLogs(logs: NetworkEntry[], maxElements: number): string {
  if (logs.length === 0) return 'No network activity captured.';

  const { items, omitted } = capArray(logs, maxElements);
  const base = items.map((l) => {
    if (l.failed) {
      const reason = l.failureReason ? ` (${l.failureReason})` : '';
      return `${l.method} ${l.url} FAILED${reason}`;
    }
    const status = l.status !== undefined ? ` ${l.status}` : '';
    const ct = l.contentType ? ` (${l.contentType})` : '';
    const duration = l.durationMs !== undefined ? ` ${l.durationMs}ms` : '';
    return `${l.method} ${l.url}${status}${ct}${duration}`;
  }).join('\n');
  return omitted > 0 ? base + `\n... [${omitted} more entries omitted]` : base;
}
