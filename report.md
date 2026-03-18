# Pandabridge Roadmap: 6.0 → 9.0

**Audit date:** 2026-03-16
**Current score:** 6.0 / 10
**Target score:** 9.0 / 10

---

## Quick-reference: Score Breakdown

| Dimension     | Now | Target | Gap |
|---------------|-----|--------|-----|
| Architecture  | 7   | 9      | +2  |
| Correctness   | 5   | 9      | +4  |
| Reliability   | 7   | 9      | +2  |
| Security      | 7   | 9      | +2  |
| Observability | 5   | 8      | +3  |
| Test Coverage | 4   | 9      | +5  |
| Documentation | 8   | 9      | +1  |
| Performance   | 5   | 8      | +3  |

## Projected Score by Phase

| Phase      | Score |
|------------|-------|
| Baseline   | 6.0   |
| After P0   | 7.5   |
| After P1   | 8.5   |
| After P2   | 9.0   |

---

## Executive Summary

The audit identified four categories of work separating Pandabridge from production-quality:

1. **Correctness bugs (P0)** — Path-selector display emits invalid CSS; `browser_navigate` bypasses the stale-page health check; a single empty env var silently resets all configuration to defaults.
2. **Reliability holes (P1)** — Missing error guard on domain-block undo; duplicate event listeners on reconnect; `name` attribute values not fully escaped in CSS selectors.
3. **Missing integration tests (P1)** — Three isolated unit test files cover formatting logic only; no test ever touches a real CDP session or asserts that a returned selector is actually clickable.
4. **Unquantified performance (P2)** — Benchmark script measures Pandabridge in isolation; no comparative data against `@playwright/mcp`; health-probe overhead is uncharacterised.

Fix P0 first — these are correctness blockers. P1 raises the floor to ~8.5. P2 is polish.

---

## P0 — Blockers (must fix before any production use)

### Bug A — Path-based selector display emits invalid CSS

**File:** `src/tools/browser-interactive-elements.ts`, lines 75–83

```ts
// Current (broken)
let displaySelector: string;
if (el.selector.startsWith('#')) {
  displaySelector = `${el.tag}${el.selector}`;          // OK: "button#submit"
} else if (el.selector.startsWith(el.tag + '[')) {
  displaySelector = `${el.tag}${el.selector.slice(el.tag.length)}`;  // OK: "input[name=...]"
} else {
  displaySelector = el.selector;                         // OK path — but display line is:
}
return `[${i + 1}] ${displaySelector}${textStr}${attrStr}`;
//                   ↑ For path selectors the tag is prepended at the call-site in some
//                     versions, producing "button body > div:nth-child(2)" — not valid CSS.
```

**Problem:** When the path-based branch is reached, any version that prepends `el.tag` at the output line produces selectors like `"button body > div:nth-child(2)"`. This is not a valid CSS selector; `browser_click` will fail on every element that lacks an `id` or `name`.

**Fix:** The `else` branch must yield `el.selector` verbatim — no tag prefix. The correct output is `"body > div:nth-child(1) > button:nth-child(2)"`.

```ts
// Correct
} else {
  displaySelector = el.selector;  // already a full nth-child path
}
```

**Side effect:** The companion test in `src/tools/browser-interactive-elements.test.ts` (line 43) must assert the path-only form:

```ts
// Correct assertion
assert.equal(line, '[1] body > div:nth-child(1) > button:nth-child(2)');
// NOT: assert.ok(line.startsWith('[1] button body > div'));
```

---

### Bug C — `browser_navigate` can bypass stale-page health check

**File:** `src/tools/browser-navigate.ts`, lines 28–37

```ts
// Current
let page: import('playwright-core').Page;
try {
  page = await ensurePage();
} catch {
  const browser = getBrowser();
  if (!browser) throw new Error('Browser not connected');
  const context = browser.contexts()[0] ?? await browser.newContext();
  page = await context.newPage();
  attachListeners(page);
  setPage(page);
}
```

**Problem:** The `catch` path bypasses `ensurePage()`'s retry logic. If `ensurePage()` throws for any reason other than "no browser", the fallback creates a raw page without the CDP-reconnect lifecycle, leaving the session in an inconsistent state. `browser_navigate` is the entry-point tool most likely to be called first — it must be the most robust.

**Fix:** Remove the manual catch-and-recreate path. Let `ensurePage()` own all reconnect logic:

```ts
// Correct
const page = await ensurePage();
```

If `ensurePage()` itself lacks binary-restart logic, that belongs inside `ensurePage()` (see P2 — Auto-reconnect for binary-managed Lightpanda), not in the tool handler.

---

### Bug D — Empty env var silently resets entire config to defaults

**File:** `src/config.ts`, line 59

```ts
// Current
...(process.env.PANDABRIDGE_EVALUATE_ENABLED != null && { evaluateEnabled: process.env.PANDABRIDGE_EVALUATE_ENABLED }),
```

**Problem:** The condition `!= null` passes when the value is `""` (an empty string). Zod's `z.boolean()` fails on `""`, which triggers the `safeParse` failure branch at line 68–74 — resetting **all** configuration fields to defaults and printing a misleading warning. A user who accidentally sets `PANDABRIDGE_EVALUATE_ENABLED=` in their shell loses their custom host, port, timeouts, and domain lists.

**Fix:** Apply the same `!== ''` guard already used for every other env var (lines 50–58):

```ts
// Correct — matches the pattern on lines 50-58
...(process.env.PANDABRIDGE_EVALUATE_ENABLED != null &&
    process.env.PANDABRIDGE_EVALUATE_ENABLED !== '' && {
      evaluateEnabled: process.env.PANDABRIDGE_EVALUATE_ENABLED
    }),
```

---

## P1 — High-value improvements (needed for 9/10)

### Integration smoke test

**Current state:** Three unit test files cover display formatting and config parsing in isolation. No test spawns a real Lightpanda process, opens a CDP session, or validates that returned selectors are actually clickable.

**Why this matters:** The CSS selector bugs above can exist (and did) because there is no end-to-end path that exercises the full call chain: `browser_navigate` → `browser_interactive_elements` → `browser_click`. Unit tests of the formatting helper catch presentation bugs but miss wiring bugs.

**What to add:** `src/integration/smoke.test.ts`

```ts
// Sketch — fill in Lightpanda binary path from env or config
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('smoke: navigate, list elements, click one', async () => {
  // 1. Spawn Lightpanda binary (skip if not available)
  // 2. Connect via CDP
  // 3. Navigate to a local static HTML fixture
  // 4. Call browser_interactive_elements — assert selectors are valid CSS
  // 5. Call browser_click with the first returned selector — assert no error
  // 6. Tear down
});
```

The fixture HTML should contain elements that exercise all three selector branches: one element with `id`, one with `name`, one with neither (path-based).

**Impact:** Raises Test Coverage from 4 → 7.

---

### Bug E — `name` attribute value not escaped in CSS attribute selector

**File:** `src/tools/browser-interactive-elements.ts`, line 46 (inside `page.evaluate`)

```ts
// Current
selector = `${tag}[name="${escapedName}"]`;
```

`escapedName` uses CSS special-character escaping (`\!`, `\#`, etc.) but does **not** escape double-quote characters within the value. A `name` attribute containing `"` produces a broken attribute selector:

```
input[name="field"name"]   ← attribute selector closes prematurely
```

**Fix:** Escape `"` before interpolation:

```ts
const safeQuote = name.replace(/"/g, '\\"');
selector = `${tag}[name="${safeQuote}"]`;
```

Apply this on top of the existing CSS escape logic, not instead of it.

---

### Bug F — Duplicate event listeners on reconnect

**File:** `src/browser/connection.ts`, lines 58–88

```ts
// Current — guard exists but confirm it is used on every attach path
const listenedPages = new WeakSet<import('playwright-core').Page>();

export function attachListeners(page: import('playwright-core').Page): void {
  if (listenedPages.has(page)) return;
  listenedPages.add(page);
  // ... console / request / response listeners
}
```

The `WeakSet` guard is present. **Verify** that every code path that creates a page calls `attachListeners` exactly once through this function — including the fallback path in `browser_navigate` (Bug C above). If Bug C's fallback is removed, this concern resolves automatically. If the fallback remains, confirm it goes through `attachListeners` rather than registering listeners inline.

**Consequence of a missed path:** Every console log and network request is emitted twice into the log buffers, doubling apparent traffic and causing the `logBufferMax` cap to be hit at half the expected volume.

---

### Bug G — Domain-block undo swallows errors silently

**File:** `src/tools/browser-go-back.ts`, lines 23–25

```ts
// Current
await page.goForward({ waitUntil: 'domcontentloaded', timeout: config.defaultTimeout }).catch(() => {});
return { content: [{ type: 'text', text: domainCheck.reason! }], isError: true };
```

**Problem:** If `goForward()` throws (e.g. the page was closed, the CDP session dropped, or there is no forward entry), the error is silently swallowed by `.catch(() => {})`. The user receives the domain block reason but no indication that the undo navigation failed. Subsequent tool calls will be made against the blocked URL.

**Fix:** Surface the undo failure while still returning the block reason:

```ts
let undoNote = '';
try {
  await page.goForward({ waitUntil: 'domcontentloaded', timeout: config.defaultTimeout });
} catch (undoErr) {
  undoNote = ` (Warning: could not undo navigation: ${(undoErr as Error).message})`;
}
return {
  content: [{ type: 'text', text: `${domainCheck.reason!}${undoNote}` }],
  isError: true,
};
```

---

### Quantify health-probe overhead

`ensurePage()` in `src/browser/state.ts` performs a liveness check on every tool call. The cost of this check is unknown.

**Action:** Add a timing harness — measure `ensurePage()` latency across 100 calls in a hot loop against a live Lightpanda instance. If median overhead exceeds 50 ms per call, add a config flag `probeEnabled: boolean` (default `true`) to allow users running in stable environments to skip the check.

Document the measured numbers here when available.

---

## P2 — Polish (pushes from ~8 to 9)

### Real comparative benchmark

`scripts/benchmark.js` measures Pandabridge end-to-end in isolation. Without a baseline, the numbers are uninterpretable.

**Action:** Add a second run in the same script using `@playwright/mcp` with an identical tool sequence (navigate → list elements → click). Report:

- Tokens per call (proxy: output length)
- Wall-clock latency per call (ms)
- Peak memory footprint (MB)

Present as a Markdown table in the benchmark output so it can be copied into release notes.

---

### Structured logging

**Current:** `process.stderr.write('[pandabridge] ...\n')` — plain strings.

**Problem:** Unstructured log lines are unsearchable. Ops tooling (Datadog, CloudWatch, Loki) cannot extract latency or tool-name fields without brittle regex parsing.

**Fix:** Emit JSON-newline entries:

```ts
process.stderr.write(JSON.stringify({ ts: Date.now(), tool, ms, url }) + '\n');
```

Keep plain-string fallback for TTY output if desired (check `process.stderr.isTTY`).

---

### Per-field config fallback

**Current** (`src/config.ts`, lines 68–74): any Zod validation failure resets **all** fields to defaults.

**Fix:** Parse fields individually using Zod's `.catch(defaultValue)` on each schema field, so one bad env var isolates its own field rather than clobbering all others. Alternatively, strip the offending key and re-parse:

```ts
const result = ConfigSchema.safeParse(raw);
if (!result.success) {
  // Remove fields that failed, re-parse with remaining keys
  const cleaned = stripFailingKeys(raw, result.error);
  return ConfigSchema.parse(cleaned);
}
```

---

### `waitForLoadState` race in `browser_click`

**File:** `src/tools/browser-click.ts`, line 20

```ts
// Current
await page.waitForLoadState('domcontentloaded', { timeout: config.defaultTimeout }).catch(() => {});
```

**Problem:** Single-page applications typically do not trigger `domcontentloaded` on in-app navigation. The wait resolves immediately (or times out), leaving the tool returning stale page state.

**Fix:** Race `waitForNavigation` against `networkidle` with a short fallback:

```ts
await Promise.race([
  page.waitForNavigation({ waitUntil: 'networkidle', timeout: config.defaultTimeout }),
  page.waitForLoadState('domcontentloaded', { timeout: config.defaultTimeout }),
]).catch(() => {});
```

---

### Auto-reconnect for binary-managed Lightpanda

**Current:** `ensurePage()` retries the CDP connection but does not restart the Lightpanda binary. If `config.binary` is set and the process crashes, CDP reconnect will keep failing until the binary is manually restarted.

**Fix:** In the reconnect path, when `config.binary` is set and all CDP retry attempts are exhausted, spawn `config.binary` with `serve --host … --port …` before attempting a final CDP connect. Store the child process handle so it can be cleaned up on MCP server shutdown.

---

## Verification Checklist

### After each P0 fix

- [ ] `npm test` — all existing tests pass
- [ ] Fix `browser-interactive-elements.test.ts` assertion at line 43 to assert the correct (no-tag-prefix) path selector form
- [ ] Manual test: navigate to a multi-element page, call `browser_interactive_elements`, verify all returned selectors are valid CSS, call `browser_click` with a path-based selector — confirm no "failed to find element" error
- [ ] Set `PANDABRIDGE_EVALUATE_ENABLED=""` in env → config should not fall back to all-defaults; other settings should be preserved
- [ ] Kill and restart Lightpanda mid-session → next `browser_navigate` call should reconnect, not hang

### After P1

- [ ] Integration smoke test (`src/integration/smoke.test.ts`) passes against a real Lightpanda binary
- [ ] Navigate to a page with `name="field\"quote"` element → `browser_interactive_elements` returns a valid selector, `browser_click` succeeds
- [ ] Navigate back from a blocked domain → confirm error message includes undo-failure note when `goForward` is unavailable

### After P2

- [ ] Benchmark report includes Pandabridge vs. `@playwright/mcp` side-by-side numbers
- [ ] Stderr output is valid JSON-newline parseable by `jq`
- [ ] SPA navigation test: navigate, trigger in-app route change via click, call `browser_get_content` — confirm content reflects new route (not previous)
