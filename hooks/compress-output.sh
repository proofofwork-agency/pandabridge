#!/usr/bin/env bash
# Hook: PostToolUse (matcher: mcp__pandabridge__.*)
# Truncates tool output that exceeds a character limit
set -euo pipefail

MAX="${PANDABRIDGE_OUTPUT_MAX:-8000}"

# Read tool output from stdin
INPUT=$(cat)

LENGTH=${#INPUT}

if [ "$LENGTH" -le "$MAX" ]; then
  echo "$INPUT"
  exit 0
fi

OMITTED=$((LENGTH - MAX))
echo "${INPUT:0:$MAX}"
echo "... [truncated by hook, ${OMITTED} chars omitted]"
