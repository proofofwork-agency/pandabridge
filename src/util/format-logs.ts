import type { ErrorEntry, ConsoleEntry, NetworkEntry } from '../browser/state.js';
import { capArray } from './output.js';

export function formatErrorLogs(logs: ErrorEntry[], maxElements: number): string {
  if (logs.length === 0) return 'No errors captured.';

  const { items, omitted } = capArray(logs, maxElements);
  let output = items.map((l) => {
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
    let line = `[${typeLabel}] ${l.message}${location}`;
    if (l.stack) line += `\n${l.stack}`;
    return line;
  }).join('\n\n');
  if (omitted > 0) output += `\n... [${omitted} more errors omitted]`;
  return output;
}

export function formatConsoleLogs(logs: ConsoleEntry[], maxElements: number): string {
  if (logs.length === 0) return 'No console messages captured.';

  const { items, omitted } = capArray(logs, maxElements);
  let output = items.map((l) => `[${l.level}] ${l.text}`).join('\n');
  if (omitted > 0) output += `\n... [${omitted} more messages omitted]`;
  return output;
}

export function formatNetworkLogs(logs: NetworkEntry[], maxElements: number): string {
  if (logs.length === 0) return 'No network activity captured.';

  const { items, omitted } = capArray(logs, maxElements);
  let output = items.map((l) => {
    if (l.failed) {
      const reason = l.failureReason ? ` (${l.failureReason})` : '';
      return `${l.method} ${l.url} FAILED${reason}`;
    }
    const status = l.status !== undefined ? ` ${l.status}` : '';
    const ct = l.contentType ? ` (${l.contentType})` : '';
    const duration = l.durationMs !== undefined ? ` ${l.durationMs}ms` : '';
    return `${l.method} ${l.url}${status}${ct}${duration}`;
  }).join('\n');
  if (omitted > 0) output += `\n... [${omitted} more entries omitted]`;
  return output;
}
