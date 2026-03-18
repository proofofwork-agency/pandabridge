# Pandabridge Demos

Five focused demos showcasing what pandabridge does — web scraping, page inspection, debugging, accessibility auditing, and form interaction.

## Prerequisites

1. Build pandabridge: `cd .. && npm run build`
2. Install [Lightpanda](https://github.com/nicholasgasior/lightpanda) at `~/.local/bin/lightpanda`
   - Or start it manually on port 9222 and pass `--no-lightpanda` to skip auto-start

## Running

```bash
# Individual demos
npm run demo:scrape       # Web scraping & research
npm run demo:inspect      # Page inspection without JS
npm run demo:debug        # Debugging a broken dashboard
npm run demo:a11y         # Accessibility auditing
npm run demo:forms        # Form filling & submission

# All demos sequentially
npm run demo:all
```

Each demo auto-starts Lightpanda unless `--no-lightpanda` is passed.

## Demo Overview

| Demo | What it shows | Local server? | Tools covered |
|------|--------------|---------------|---------------|
| **01-scrape** | Scrape pages, extract data, gather links | No | 7 tools |
| **02-inspect** | Understand page structure without JS | No | 6 tools |
| **03-debug** | Debug a broken web app | Yes (:3777) | 9 tools |
| **04-accessibility** | Audit a page for a11y issues | Yes (:3779) | 5 tools |
| **05-forms** | Fill and submit forms | Yes (:3780) | 10 tools |

22 of 23 pandabridge tools are covered. `browser_evaluate` is excluded — it's disabled by default and requires explicit opt-in.

## Architecture

```
demo/
  shared/
    mcp-client.js       # MCP stdio client (JSON-RPC over child process)
    lightpanda.js        # Lightpanda start/stop/wait helpers
  01-scrape/             # No dependencies — hits public URLs
  02-inspect/            # No dependencies — hits public URLs
  03-debug/              # Local server with intentionally broken dashboard
  04-accessibility/      # Local server with intentional a11y issues
  05-forms/              # Local server with multi-field form
```

Zero npm dependencies.
