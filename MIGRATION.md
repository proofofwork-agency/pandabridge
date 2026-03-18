# Migration Guide: v0.2.x → v1.0.0

Pandabridge v1.0.0 is a production release with stable APIs and enhanced capabilities. If you're upgrading from v0.2.x, this guide covers the changes you need to know about.

## Breaking Changes

### Tool Naming Convention

v0.2.x used short tool names. v1.0.0 uses a consistent prefix pattern for better organization:

| v0.2.x | v1.0.0 | Purpose |
|--------|--------|---------|
| `goto` | `browser_navigate` | Navigate to a URL |
| `markdown` | `browser_markdown` | Get page markdown |
| `links` | `browser_links` | Extract links |
| `click` | `browser_click` | Click elements |
| `fill` | `browser_type` | Type into fields |
| `evaluate` | `browser_evaluate` | Run JavaScript |
| (new) | `scrape_page` | Scrape URL in one call |
| (new) | `scrape_batch` | Batch scrape multiple URLs |
| (new) | `extract_data` | Extract JSON from CSS selectors |

### Tool Additions in v1.0.0

**New scraping tools:**
- `scrape_page` — Navigate to URL and return title, markdown, and links in one call (replaces: `goto` → `markdown` → `links` workflow)
- `scrape_batch` — Scrape multiple URLs sequentially with partial-failure reporting
- `extract_data` — Extract structured JSON using CSS selectors

**New interaction tools:**
- `browser_press_key` — Press keyboard keys
- `browser_scroll` — Scroll the page

**New observation tools:**
- `browser_interactive_elements` — List all clickable/fillable elements with reusable `elementId`
- `browser_dom_query` — Query DOM elements with CSS selectors
- `browser_accessibility` — Get accessibility-oriented DOM outline
- `browser_cookies` — Read and manage cookies
- `browser_status` — Check connection and current page state
- `browser_errors` — Get uncaught page errors
- `browser_network_requests` — Get network activity

**New diagnosis tools:**
- `browser_debug_report` — One-shot page diagnosis (navigate, act, collect errors/network/console)

**Removed in v1.0.0:**
- `browser_go_back`, `browser_go_forward` — Use `browser_navigate` with browser history instead
- `browser_screenshot` — Replaced by lighter alternatives (will return in v1.1.0 with caching)

## Configuration Changes

### New Environment Variables

v1.0.0 adds new configuration options:

```bash
# New in v1.0.0
PANDABRIDGE_BATCH_MAX_URLS=10              # Max URLs per scrape_batch call
PANDABRIDGE_OUTPUT_MAX_CHARS=8000          # Truncate output at N characters
PANDABRIDGE_OUTPUT_MAX_ELEMENTS=50         # Limit interactive elements returned
PANDABRIDGE_EVALUATE_ENABLED=false         # Disable browser_evaluate by default (security)
PANDABRIDGE_DEBUG=false                    # Enable debug logging

# Previously available (unchanged)
LIGHTPANDA_HOST=127.0.0.1
LIGHTPANDA_PORT=9222
LIGHTPANDA_BINARY=/usr/local/bin/lightpanda
LIGHTPANDA_CDP_WS_URL=wss://...            # Remote CDP
PANDABRIDGE_DEFAULT_TIMEOUT=15000
PANDABRIDGE_DOMAIN_ALLOWLIST=*.example.com # Restrict navigation
PANDABRIDGE_DOMAIN_BLOCKLIST=internal.*    # Block specific domains
```

### Removed Configuration

- `PANDABRIDGE_ARTIFACTS_DIR` — Screenshot feature temporarily removed

## Upgrade Path

### Step 1: Update Your Package

```bash
npm install pandabridge@1.0.0
```

Or from npm globally:

```bash
npm install -g pandabridge@1.0.0
```

### Step 2: Update Tool Calls in Your Prompts

Replace old tool names with new ones:

**Before (v0.2.x):**
```
1. Use `goto` to navigate to https://example.com
2. Use `markdown` to get the page content
3. Use `click` to click on the submit button
4. Use `links` to extract all links
```

**After (v1.0.0):**
```
1. Use `scrape_page` to navigate and get title, markdown, and links in one call
2. Use `browser_click` to click on the submit button
3. Use `browser_links` to extract specific links with filters
```

Or use the new convenience tools:

```
1. Use `scrape_page` to get everything at once
2. Use `browser_type` (instead of `fill`) to type into fields
3. Use `browser_press_key` to press Enter
4. Use `browser_wait_for` to wait for results
```

### Step 3: Leverage New Token-Efficient Workflows

v1.0.0 is optimized for agent loops. Use these patterns:

**Old workflow (6 tool calls, ~2000 tokens in MCP overhead):**
```
goto("url") → markdown() → links() → goto("link1") → markdown() → Done
```

**New workflow (2 tool calls, ~800 tokens in MCP overhead):**
```
scrape_page("url") → scrape_page("link1") → Done
```

## Behavior Changes

### Output Format

- All single-page tools now include the current page URL in responses
- Interactive elements are assigned reusable `elementId` values (e.g., `e1-1`) — reference these instead of selectors for faster interactions
- Console logs and network requests are capped to prevent context overflow (configurable via `PANDABRIDGE_OUTPUT_MAX_CHARS`)

### JavaScript Execution

- `browser_evaluate` is **disabled by default** for security (LLM-driven workflows are risky with arbitrary JS)
- Enable only if needed: `export PANDABRIDGE_EVALUATE_ENABLED=true`
- When enabled, expressions are logged for debugging but not results (to avoid leaking secrets)

### Connection Recovery

- Pandabridge now automatically recovers from stale browser connections
- `browser_navigate` and other tools will reconnect if the browser is unreachable
- No user action needed

## FAQ

**Q: Will my v0.2.x scripts break?**
A: Yes, tool names have changed. You'll need to update `goto` → `browser_navigate`, `markdown` → `browser_markdown`, etc. The functionality is the same or improved.

**Q: Should I upgrade?**
A: Yes. v1.0.0 is production-ready and more token-efficient. It's the recommended version for all new work.

**Q: Can I stay on v0.2.x?**
A: Yes, but v1.0.0 has better features and performance. v0.2.x will not receive updates.

**Q: What about screenshots?**
A: `browser_screenshot` was temporarily removed (it will return in v1.1.0 with caching and performance improvements). For now, use `browser_snapshot` to get a text-based page summary instead.

**Q: How do I use the new scraping tools?**
A: They're designed for agent loops. Instead of `goto` + `markdown` + `links` (3 calls), use `scrape_page` (1 call). See [Use Cases](README.md#use-cases) in the README for examples.

## Support

- **Issues:** [GitHub Issues](https://github.com/proofofworks/pandabridge/issues)
- **Documentation:** [README.md](README.md) and [Setup Guide](docs/setup.md)
- **Performance:** v1.0.0 saves ~40% tool overhead vs Playwright MCP on typical research tasks
