# Changelog

## [1.0.0] - 2026-03-18

**Production Release.** Pandabridge is now stable and ready for production use. All core browser automation, scraping, and MCP protocol features are production-tested and documented. No breaking changes since 0.3.0.

### Summary of v0.4.0-beta.1 features now in v1.0.0

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
- Ring-buffer capping for console and network logs
- Token-optimized output with configurable limits
- Page URL context included in all tool responses
- Companion Claude Code hooks (`npm run setup-hooks`)
- CI pipeline with Node 18/20/22 matrix
- npm packaging with `files` field for clean installs
