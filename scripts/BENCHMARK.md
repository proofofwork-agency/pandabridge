# Benchmark Methodology

## What it measures

The benchmark (`scripts/benchmark.js`) runs 3 tools sequentially against a target URL:

1. `browser_navigate` — navigate to the URL
2. `browser_interactive_elements` — extract interactive elements
3. `browser_snapshot` — take a text snapshot of the page

Total token count is the sum of all three tool responses.

## Token heuristic

Tokens are estimated at **~4 characters per token**. This is a rough approximation and has not been validated against the Claude tokenizer. Actual token counts may vary.

## How the README's "~27K" was produced

- **URL:** `https://example.com`
- **Pandabridge version:** 0.2.0
- **Node version:** v22.x
- **Date:** 2026-03-16

## How to reproduce

```bash
# Requires Lightpanda running on :9222 and a built project
npm run build
node scripts/benchmark.js https://example.com
```

## Caveats

- Token count varies significantly with page complexity. A simple page like `example.com` produces minimal tokens; a rich web app could produce much more.
- The `--timeout <ms>` flag controls per-request timeout (default: 30000ms).
- Results depend on Lightpanda's rendering behavior, which may differ from Chrome.
