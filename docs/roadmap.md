# Roadmap

What's planned for Pandabridge.

---

## v0.3.0-beta.2 (current)

- [x] 23 tools total: 20 browser tools + 3 scraping tools
- [x] `browser_status` — connection health check
- [x] `scrape_page`, `scrape_batch`, and `extract_data`
- [x] Lightpanda Cloud / remote CDP WebSocket support
- [x] Page URL context in single-page tool responses
- [x] Compact tabular output for interactive elements
- [x] Token-optimized output with configurable limits
- [x] Zod-validated config with env var + JSON file support
- [x] CDP connection retry with exponential backoff
- [x] Ring-buffer log capping
- [x] Redirect-safe domain enforcement after navigation
- [x] Companion Claude Code hooks
- [x] `npm run setup-hooks` installer
- [x] Published to npm as `pandabridge`
- [x] CI pipeline with Node 18/20/22 matrix

---

## Next — Testing & Reliability

- [x] Unit tests for output utilities (truncate, cap, format)
- [ ] Integration tests with mock CDP server
- [x] CI pipeline (GitHub Actions)
- [ ] Error recovery — auto-reconnect on CDP disconnect
- [ ] Page crash detection and recovery
- [ ] Timeout handling improvements per tool

---

## v0.4.0 — Extended Browser Capabilities

- [ ] `browser_storage_get` / `browser_storage_set` — localStorage/sessionStorage access (via `page.evaluate`)
- [ ] `browser_hover` — hover over elements (useful for tooltips and menus; depends on Lightpanda adding layout computation)
- [ ] `browser_drag` — drag and drop support (depends on Lightpanda adding coordinate-based input)

---

## v0.5.0 — Multi-Page & Tabs

> Lightpanda currently supports a single CDP connection per session. Multi-tab support depends on Lightpanda adding multi-context CDP capabilities. This milestone may be deferred.

- [ ] `browser_tab_list` — list open tabs
- [ ] `browser_tab_new` — open new tab
- [ ] `browser_tab_select` — switch between tabs
- [ ] `browser_tab_close` — close a tab
- [ ] Isolated browser contexts per tab

---

## v0.6.0 — Smart Output

- [ ] Auto-detect output format based on page content (tables, forms, articles)
- [ ] Diff-based updates — only send what changed since last snapshot
- [ ] Content-aware truncation — preserve headings and structure when truncating
- [ ] `browser_find` — search for text on the page and return context around matches

---

## v0.7.0 — Developer Experience

- [ ] `npx pandabridge init` — interactive setup wizard
- [ ] Config validation CLI command
- [ ] Debug mode with verbose logging
- [ ] MCP inspector integration

---

## Future Ideas (unscheduled)

- **Authentication flows** — built-in support for login sequences with credential storage
- **Request interception** — modify/block network requests
- **Performance profiling** — expose Lightpanda's performance metrics as a tool
- **Proxy support** — route browser traffic through a proxy
- **Multiple browser backends** — optional Chrome/Firefox fallback when Lightpanda can't render a page (speculative; no concrete implementation path)
- **Recording mode** — record browser interactions as replayable scripts
- **Resource blocking** — skip images, fonts, and other heavy resources to speed up page loads
- **Accessibility tree** — expose a true browser accessibility tree (richer than the current DOM-derived outline)

---

## Known Lightpanda Limitations

These constraints affect what Pandabridge can realistically offer:

- **No graphical rendering engine** — Lightpanda cannot produce screenshots, PDFs, or visual regression snapshots. Tools like `browser_screenshot` and `browser_pdf` are not possible.
- **Single CDP connection per session** — multi-tab and multi-context workflows are not currently supported.
- **Partial CDP domain coverage** — Lightpanda is beta software; some CDP domains and methods are unimplemented or incomplete.
- **Local page JS execution can be unreliable** — `page.evaluate` works in many cases, but complex page scripts may behave differently than in Chrome.
- **No coordinate-based interaction without layout engine** — hover, drag, and other interactions that require layout computation depend on Lightpanda adding these capabilities.
- **Playwright over CDP is lower fidelity** — Playwright's CDP transport is documented as "significantly lower fidelity" than its native protocol, which affects reliability of some operations.

---

## Contributing

Ideas and contributions welcome. Open an issue to discuss before submitting a PR for anything on the Future Ideas list.
