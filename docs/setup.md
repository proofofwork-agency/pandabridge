# Setup Guide

## Prerequisites

- **Node.js** 18+
- **Lightpanda** headless browser ([install guide](https://github.com/lightpanda-io/browser#installation))
- **Claude Code** CLI ([install guide](https://docs.anthropic.com/en/docs/claude-code))

## Installation

### 1. Clone and build

```bash
git clone https://github.com/proofofwork-agency/pandabridge.git
cd pandabridge
npm install
npm run build
```

### 2. Start Lightpanda

Use one of these connection modes:

```bash
# Option A: local Lightpanda you start yourself
lightpanda serve --host 127.0.0.1 --port 9222
```

```bash
# Option B: let Pandabridge auto-start a local binary
export LIGHTPANDA_BINARY=/usr/local/bin/lightpanda
```

```bash
# Option C: connect directly to Lightpanda Cloud / remote CDP
export LIGHTPANDA_CDP_WS_URL=wss://your-instance.lightpanda.cloud
```

With option B or C, you do not need to start a local browser manually.

### 3. Register with Claude Code

```bash
claude mcp add pandabridge node dist/index.js
```

Verify:

```bash
claude mcp list
```

You should see `pandabridge` with 23 tools.

### 4. Test it

Open Claude Code and try:

```
Go to https://example.com and get the page snapshot
```

---

## Configuration

Pandabridge reads configuration from three sources (highest priority first):

1. **Environment variables**
2. **JSON config file** at `~/.pandabridge/config.json`
3. **Built-in defaults**

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIGHTPANDA_HOST` | `127.0.0.1` | Lightpanda bind host |
| `LIGHTPANDA_PORT` | `9222` | Lightpanda CDP port |
| `LIGHTPANDA_BINARY` | — | Path to Lightpanda binary (enables auto-start) |
| `LIGHTPANDA_CDP_WS_URL` | — | Direct CDP WebSocket URL (Lightpanda Cloud / remote CDP endpoint) |
| `PANDABRIDGE_OUTPUT_MAX_CHARS` | `8000` | Max characters per tool response |
| `PANDABRIDGE_OUTPUT_MAX_ELEMENTS` | `50` | Max items in array outputs (links, elements, logs) |
| `PANDABRIDGE_DEFAULT_TIMEOUT` | `15000` | Default timeout per tool (ms) |
| `PANDABRIDGE_LOG_BUFFER_MAX` | `500` | Max console/network log entries to keep in memory |
| `PANDABRIDGE_CDP_RETRY_ATTEMPTS` | `3` | CDP connection retry attempts |
| `PANDABRIDGE_CDP_RETRY_DELAY_MS` | `1000` | Base retry delay (doubles each attempt) |
| `PANDABRIDGE_BATCH_MAX_URLS` | `10` | Max URLs allowed in one `scrape_batch` call |
| `PANDABRIDGE_DOMAIN_ALLOWLIST` | — | Comma-separated allowed domains |
| `PANDABRIDGE_DOMAIN_BLOCKLIST` | — | Comma-separated blocked domains |
| `PANDABRIDGE_EVALUATE_ENABLED` | `false` | Set to `true` to enable `browser_evaluate` (disabled by default for security) |
| `PANDABRIDGE_DEBUG` | `false` | Enable verbose stderr logging |

### JSON Config File

Create `~/.pandabridge/config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 9222,
  "outputMaxChars": 8000,
  "outputMaxElements": 50,
  "defaultTimeout": 15000,
  "logBufferMax": 500,
  "domainAllowlist": [],
  "domainBlocklist": ["malware-site.com"],
  "cdpRetryAttempts": 3,
  "cdpRetryDelayMs": 1000,
  "batchMaxUrls": 10,
  "cdpWsUrl": "wss://your-instance.lightpanda.cloud"
}
```

All fields are optional. Each invalid field falls back to its own default independently, with a per-field warning on stderr. Other valid fields are preserved.

### Domain Filtering

All tools enforce domain filtering. Top-level navigation tools (`browser_navigate`, `browser_debug_report`, `scrape_page`, `scrape_batch`) check both the requested URL and the final redirected URL. Interaction tools that can change the current page (`browser_click`) validate the resulting page after navigation. Other tools verify the current page domain before operating, catching JS-triggered redirects to restricted domains. You can also set these via environment variables:
- `PANDABRIDGE_DOMAIN_ALLOWLIST` — comma-separated list of allowed domains
- `PANDABRIDGE_DOMAIN_BLOCKLIST` — comma-separated list of blocked domains

Example:

- **Allowlist** (empty = allow all): Only these domains are permitted
- **Blocklist**: These domains are always blocked

---

### Security: browser_evaluate

`browser_evaluate` executes arbitrary JavaScript in the page context. In LLM-driven workflows, page content could instruct Claude to call this tool with malicious expressions (prompt injection). Only use this tool on pages you trust. Enable with `PANDABRIDGE_EVALUATE_ENABLED=true`.

---

## Hooks

Pandabridge ships optional Claude Code hook scripts that add automation around the MCP tools.

### Install all hooks

```bash
npm run setup-hooks
```

This backs up your existing settings and adds the hook entries.

### What gets installed

| Hook | Event | What it does |
|------|-------|-------------|
| `init-lightpanda.sh` | SessionStart | Auto-starts Lightpanda if not running |
| `validate-url.sh` | PreToolUse | Blocks navigation to domains in `PANDABRIDGE_DOMAIN_BLOCKLIST` |
| `compress-output.sh` | PostToolUse | Truncates oversized tool output |
| `capture-errors.sh` | PostToolUse | Logs errors to `~/.pandabridge/error.log` |

> **Note:** Both the MCP server (`outputMaxChars`) and `compress-output.sh` (`PANDABRIDGE_OUTPUT_MAX`) truncate output independently. When both are active, output may be truncated twice with separate `[truncated]` suffixes. If you rely on server-side limits, you may want to disable the `compress-output.sh` hook.

### Configure hook behavior

```bash
# Domain blocklist for validate-url hook (comma-separated)
export PANDABRIDGE_DOMAIN_BLOCKLIST="malware.com,phishing.net"

# Output limit for compress-output hook
export PANDABRIDGE_OUTPUT_MAX=8000
```

### Hook chaining behavior

When multiple hooks are listed in the same array entry (as `compress-output.sh` and `capture-errors.sh` are in PostToolUse), Claude Code runs them sequentially — each hook receives the stdout of the previous hook as its stdin. This means `capture-errors.sh` receives the already-compressed output, not the original. If you need each hook to see the original tool output independently, add them as separate array entries.

### Manual hook installation

If you prefer to add hooks manually, add to `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup",
      "hooks": [{ "type": "command", "command": "./hooks/init-lightpanda.sh", "async": true }]
    }],
    "PreToolUse": [{
      "matcher": "mcp__pandabridge__browser_navigate",
      "hooks": [{ "type": "command", "command": "./hooks/validate-url.sh" }]
    }],
    "PostToolUse": [{
      "matcher": "mcp__pandabridge__.*",
      "hooks": [
        { "type": "command", "command": "./hooks/compress-output.sh" },
        { "type": "command", "command": "./hooks/capture-errors.sh" }
      ]
    }]
  }
}
```

---

## Troubleshooting

### "Failed to connect to CDP"

1. Is Lightpanda running? `curl http://127.0.0.1:9222/json/version`
2. Is the port correct? Check `LIGHTPANDA_PORT`
3. Increase retries: `export PANDABRIDGE_CDP_RETRY_ATTEMPTS=5`

### "No active page"

You need to call `browser_navigate` before using most page-scoped tools. The browser needs a page to operate on. `scrape_page` is the exception: it navigates for you.

### Lightpanda Cloud / remote CDP

If you're using Lightpanda Cloud or another remote CDP endpoint:

```bash
export LIGHTPANDA_CDP_WS_URL=wss://your-instance.lightpanda.cloud
```

When this is set, Pandabridge skips local browser startup and connects directly over WebSocket.

### Framework-heavy apps

Pandabridge is optimized for rendered-page inspection, scraping, and compact diagnosis. It is not a full Chrome DevTools replacement: source maps, component stacks, performance traces, and some framework internals may be unavailable or incomplete on Lightpanda.

### Output is too large / context window issues

Lower the output limits:

```bash
export PANDABRIDGE_OUTPUT_MAX_CHARS=4000
export PANDABRIDGE_OUTPUT_MAX_ELEMENTS=25
```

### Tools not appearing in Claude Code

```bash
claude mcp list                   # verify registration
claude mcp remove pandabridge     # remove
claude mcp add pandabridge node dist/index.js  # re-add
```

---

## Development

```bash
# Run in dev mode (auto-recompile)
npm run dev

# Build
npm run build

# Test with JSON-RPC over stdin
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

## Testing

```bash
npm test              # unit tests (no Lightpanda required)
npm run test:smoke    # integration smoke test (requires Lightpanda on :9222)
```

## elementId workflow

`browser_interactive_elements` returns compact `elementId` values like `e3-2`.

Use those IDs with:

- `browser_click`
- `browser_type`
- `browser_select_option`
- `browser_wait_for`
- `browser_scroll`

This is usually more reliable for agent workflows than copying long CSS selectors back into later tool calls.
