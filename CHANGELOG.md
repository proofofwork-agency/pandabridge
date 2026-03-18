# Changelog

## [0.5.0] - 2026-03-18

**Initial public release.** Pandabridge is stable and ready for production use. All core browser automation, scraping, and MCP protocol features are production-tested and documented.

### Added
- `browser_debug_report` tool — one-shot page diagnosis: navigate, perform optional actions, then capture errors, network requests, and console state in a single compact report
- Framework error detection — React, Vue, and Angular errors surfaced via `console.error` are now captured as structured error entries alongside uncaught exceptions
- Error deduplication — prevents duplicate error entries when both `pageerror` and `window.onerror` fire for the same exception
- SSRF protection — domain allowlist and blocklist are enforced before navigation and re-validated after every redirect
- Deterministic action settling — `browser_type`, `browser_select_option`, and `browser_press_key` now wait for network idle after actions (capped at 1.5 s)
- 23 total tools: 3 scraping tools (`scrape_page`, `scrape_batch`, `extract_data`) and 20 browser tools
- Zod-validated configuration with env var, JSON file, and built-in defaults
- CDP connection retry with configurable attempts and exponential backoff
- Capped buffer log management for console, network, and error streams
- Redirect-safe domain enforcement and `browser_evaluate` disabled by default for security
- Companion Claude Code hooks (`npm run setup-hooks`) for auto-start, URL validation, output compression, and error logging
- CI matrix covering Node 18, 20, and 22

### Fixed (pre-publish hardening)
- `browser_scroll` and `browser_wait_for` now correctly accept `0` for `amount` and `timeout` parameters (was silently falling back to defaults due to `||` operator)
- `browser_snapshot` and `browser_markdown` selector defaults now use nullish coalescing
- Network log updates are now immutable (spread instead of Object.assign mutation), keeping networkMap and networkLogs in sync
- `readOnlyHint` corrected to `true` for `browser_scroll` and `browser_wait_for`
- Logging added to previously silent catch blocks

### Internal
- Extracted `toError()` and `toErrorMessage()` utilities replacing inline error coercion patterns
- Extracted `formatErrorLogLine()`, `createReconnectFresh()`, and `matchesDomain()` to reduce duplication
- Replaced 5 magic numbers with named constants in `src/util/constants.ts`
- Improved type safety: typed window augmentation, `Parameters<typeof console.error>`, explicit `Page | undefined`
- Domain lists now normalized via Zod `.transform()` instead of post-parse mutation
- Added `.min(1)` validation to optional selector Zod schemas
- Added unit tests for `completeNetworkRequest` sync behavior (3 tests)

## [0.4.0-beta.1] - 2026-03-17

### Added
- `browser_debug_report` tool — one-shot page diagnosis that navigates, performs actions, and collects errors/network/console into a compact report
- Deterministic action settling — `browser_type`, `browser_select_option`, and `browser_press_key` now wait for network idle after actions (up to 1.5s cap)
- Framework error detection — React, Vue, and Angular errors logged via `console.error` are now captured as structured error entries
- Error deduplication — prevents duplicate entries from `pageerror` and `window.onerror` firing for the same error

### Fixed
- Documentation tool count mismatch (README said 16, actual was 19, now correctly shows 20)
- Added missing tools to README: `browser_dom_query`, `browser_accessibility`, `browser_cookies`, `browser_debug_report`

## [0.3.0-beta.2] - 2026-03-17

### Fixed
- Clean `dist/` before every build so removed tools do not remain in published packages
- Align README and setup docs with the actual 16-tool runtime surface
- Remove stale documentation for `browser_screenshot`, history navigation tools, and `PANDABRIDGE_ARTIFACTS_DIR`

## [0.3.0-beta.1] - 2026-03-16

### Added
- `browser_screenshot` tool for saving PNG page captures to disk
- `elementId` targeting flow:
  - `browser_interactive_elements` now emits compact `elementId` values
  - `browser_click`, `browser_type`, `browser_select_option`, `browser_wait_for`, and `browser_scroll` can target by `elementId`
- Configurable artifacts directory via `PANDABRIDGE_ARTIFACTS_DIR`

### Changed
- `browser_click` now supports configurable post-click wait behavior (`none`, `domcontentloaded`, `load`, `networkidle`)
- Smoke test now verifies screenshot capture against a live Lightpanda instance
- Tool responses consistently include the current page URL when available

## [0.2.0] - 2026-03-16

### Added
- 17 browser automation tools:
  - **Navigation:** `browser_navigate`, `browser_go_back`, `browser_go_forward`
  - **Interaction:** `browser_click`, `browser_type`, `browser_press_key`, `browser_select_option`, `browser_scroll`
  - **Observation:** `browser_snapshot`, `browser_markdown`, `browser_links`, `browser_interactive_elements`
  - **Utilities:** `browser_evaluate`, `browser_wait_for`, `browser_console_messages`, `browser_network_requests`
  - **Status:** `browser_status` — connection health check with current URL and page title
- Zod-validated configuration via environment variables or `~/.pandabridge/config.json`
- Domain allowlist/blocklist for restricting navigation
- CDP connection retry with exponential backoff
- Capped buffer management for console and network logs
- Token-optimized output with configurable limits
- Page URL context included in all tool responses
- Companion Claude Code hooks (`npm run setup-hooks`)
- CI pipeline with Node 18/20/22 matrix
- npm packaging with `files` field for clean installs
