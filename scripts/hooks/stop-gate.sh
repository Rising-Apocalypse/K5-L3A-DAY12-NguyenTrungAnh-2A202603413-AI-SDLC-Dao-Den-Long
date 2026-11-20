#!/usr/bin/env bash
# Claude Code Stop hook: do not let the agent stop while the test suite is failing.
# Exit 2 blocks stopping (stderr goes back to the agent); exit 0 lets it stop.
cd "$(dirname "$0")/../.." || exit 0

payload="$(cat)"
active="$(printf '%s' "$payload" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try { process.stdout.write(JSON.parse(s).stop_hook_active === true ? "true" : "false"); }
  catch { process.stdout.write("false"); }
});')"

# Already continuing because of this hook: do not loop forever.
if [ "$active" = "true" ]; then exit 0; fi

if output="$(npm test --silent 2>&1)"; then
  exit 0
fi
printf '%s\n' "$output" | tail -40 >&2
echo "stop-gate: npm test failed - fix the failing tests before finishing." >&2
exit 2
