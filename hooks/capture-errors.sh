#!/usr/bin/env bash
# Hook: PostToolUse (matcher: mcp__pandabridge__.*)
# Logs errors to ~/.pandabridge/error.log
set -euo pipefail

LOG_DIR="$HOME/.pandabridge"
LOG_FILE="$LOG_DIR/error.log"

# Read tool output from stdin
INPUT=$(cat)

# Echo input back unchanged
echo "$INPUT"

# Check if output indicates an error using proper JSON parsing
IS_ERROR=$(node -e "
try {
  const d = JSON.parse(process.argv[1]);
  const err = d.isError === true
    || (Array.isArray(d.content) && d.content.some(c => c.isError === true))
    || (d.result && d.result.isError === true);
  process.stdout.write(err ? 'true' : 'false');
} catch { process.stdout.write('false'); }
" "$INPUT" 2>/dev/null || echo "false")

if [ "$IS_ERROR" = "true" ]; then
  mkdir -p "$LOG_DIR"
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $INPUT" >> "$LOG_FILE"
fi
