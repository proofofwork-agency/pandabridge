#!/usr/bin/env bash
# Hook: PreToolUse (matcher: mcp__pandabridge__browser_navigate)
# Validates URLs against a domain blocklist
set -euo pipefail

BLOCKLIST="${PANDABRIDGE_DOMAIN_BLOCKLIST:-}"

# No blocklist configured — allow all
if [ -z "$BLOCKLIST" ]; then
  exit 0
fi

# Read tool input JSON from stdin
INPUT=$(cat)

# Extract URL from the input using proper JSON parsing
URL=$(echo "$INPUT" | node -e "
let d='';
process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try { const j=JSON.parse(d); process.stdout.write(j.input?.url || j.url || ''); }
  catch { process.exit(0); }
});
" 2>/dev/null || true)

if [ -z "$URL" ]; then
  exit 0
fi

# Extract domain from URL
DOMAIN=$(echo "$URL" | sed -E 's|^https?://||' | sed -E 's|[:/].*||')

# Check against blocklist (comma-separated)
IFS=',' read -ra BLOCKED <<< "$BLOCKLIST"
for blocked in "${BLOCKED[@]}"; do
  blocked=$(echo "$blocked" | xargs)  # trim whitespace
  if [ "$DOMAIN" = "$blocked" ] || [[ "$DOMAIN" == *".$blocked" ]]; then
    echo "[pandabridge] Blocked: ${DOMAIN} is on the domain blocklist" >&2
    exit 2
  fi
done

exit 0
