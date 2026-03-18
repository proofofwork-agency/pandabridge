#!/usr/bin/env bash
# Installs pandabridge companion hooks into Claude Code settings
set -euo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect settings file location
if [ -f ".claude/settings.json" ]; then
  SETTINGS=".claude/settings.json"
elif [ -f "$HOME/.claude/settings.json" ]; then
  SETTINGS="$HOME/.claude/settings.json"
else
  # Create project-level settings
  mkdir -p .claude
  SETTINGS=".claude/settings.json"
  echo '{}' > "$SETTINGS"
fi

echo "[pandabridge] Using settings file: $SETTINGS"

# Backup existing settings
cp "$SETTINGS" "${SETTINGS}.bak"
echo "[pandabridge] Backed up to ${SETTINGS}.bak"

# Generate hook configuration using Node.js for reliable JSON manipulation
TMPFILE=$(mktemp /tmp/pandabridge-install-XXXXXX.js)
cat > "$TMPFILE" << 'JSEOF'
const fs = require('fs');
const hooksDir = process.env.HOOKS_DIR;
const settingsPath = process.env.SETTINGS_PATH;
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

settings.hooks = settings.hooks || {};

settings.hooks.SessionStart = settings.hooks.SessionStart || [];
if (!settings.hooks.SessionStart.some(h => h.hooks?.some(hh => hh.command?.includes('init-lightpanda')))) {
  settings.hooks.SessionStart.push({
    matcher: 'startup',
    hooks: [{ type: 'command', command: hooksDir + '/init-lightpanda.sh', async: true }]
  });
}

settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
if (!settings.hooks.PreToolUse.some(h => h.matcher === 'mcp__pandabridge__browser_navigate')) {
  settings.hooks.PreToolUse.push({
    matcher: 'mcp__pandabridge__browser_navigate',
    hooks: [{ type: 'command', command: hooksDir + '/validate-url.sh' }]
  });
}

settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
if (!settings.hooks.PostToolUse.some(h => h.hooks?.some(hh => hh.command?.includes('compress-output')))) {
  settings.hooks.PostToolUse.push({
    matcher: 'mcp__pandabridge__.*',
    hooks: [
      { type: 'command', command: hooksDir + '/compress-output.sh' },
      { type: 'command', command: hooksDir + '/capture-errors.sh' }
    ]
  });
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('[pandabridge] Hooks installed successfully');
JSEOF
HOOKS_DIR="$HOOKS_DIR" SETTINGS_PATH="$SETTINGS" node "$TMPFILE"
rm -f "$TMPFILE"

echo "[pandabridge] Done. Restart Claude Code to activate hooks."
