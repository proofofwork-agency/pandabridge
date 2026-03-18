import type { Config } from '../config.js';

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return text.slice(0, maxChars) + `\n... [truncated, ${omitted} chars omitted]`;
}

export function capArray<T>(items: T[], max: number): { items: T[]; omitted: number } {
  if (items.length <= max) return { items, omitted: 0 };
  return { items: items.slice(0, max), omitted: items.length - max };
}

const BEGIN_DELIMITER = '--- BEGIN PAGE CONTENT (untrusted) ---';
const END_DELIMITER = '--- END PAGE CONTENT ---';

export function formatToolResponse(text: string, config: Config, pageUrl?: string): string {
  const prefix = pageUrl ? `[URL: ${pageUrl}]\n` : '';
  // Reserve space for prefix + delimiters so they are never truncated
  const overhead = prefix.length + BEGIN_DELIMITER.length + END_DELIMITER.length + 2; // +2 for newlines
  const contentBudget = Math.max(100, config.outputMaxChars - overhead);
  const truncatedContent = truncateText(text, contentBudget);
  return `${prefix}${BEGIN_DELIMITER}\n${truncatedContent}\n${END_DELIMITER}`;
}
