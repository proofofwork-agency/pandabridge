import type { Page } from 'playwright-core';

/**
 * Inject error and unhandledrejection listeners (via addEventListener, not
 * overwriting window.onerror) and a console.error monkey-patch for framework
 * error detection. Structured messages are picked up by the console listener
 * in connection.ts and routed to the error log.
 *
 * Uses addEventListener so existing page/framework handlers are preserved.
 */
export async function injectErrorInstrumentation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as Window & { __pb_instrumented?: boolean };
    if (w.__pb_instrumented) return;
    w.__pb_instrumented = true;

    // Use addEventListener to chain — never overwrite window.onerror
    window.addEventListener('error', (event: ErrorEvent) => {
      console.error(JSON.stringify({
        _pb: 'error',
        msg: event.message || String(event.error),
        source: event.filename || undefined,
        line: event.lineno || undefined,
        col: event.colno || undefined,
        stack: event.error?.stack || undefined,
      }));
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      console.error(JSON.stringify({
        _pb: 'rejection',
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      }));
    });

    // Monkey-patch console.error to detect framework errors
    const origConsoleError = console.error;
    console.error = (...args: Parameters<typeof console.error>) => {
      if (args.length > 0 && typeof args[0] === 'string') {
        const first = args[0];
        let framework: string | null = null;

        if (/^Warning:/.test(first) || (first.includes('\n    at ') && first.includes('Component'))) {
          framework = 'react';
        } else if (/^\[Vue warn\]/.test(first)) {
          framework = 'vue';
        } else if (/^ERROR/.test(first)) {
          framework = 'angular';
        }

        if (framework) {
          origConsoleError.apply(console, [JSON.stringify({
            _pb: 'framework-error',
            framework,
            msg: args.map(String).join(' '),
          })]);
          return;
        }
      }

      origConsoleError.apply(console, args);
    };
  });
}
