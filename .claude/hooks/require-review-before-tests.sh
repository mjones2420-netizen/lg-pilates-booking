#!/usr/bin/env bash
# require-review-before-tests.sh
#
# PreToolUse(Bash) gate. Blocks a Playwright / npm test run when PRODUCT files
# (index.html, DB migrations, edge functions) have uncommitted changes that have
# not yet been code-reviewed this cycle. Enforces the pipeline order:
#   edit product code -> /code-review -> /security-review -> tests -> commit/push
# regardless of whether a "deploy" trigger word was ever spoken.
#
# The gate clears when .claude/.review-marker is newer than the newest changed
# product file. Running the reviews and then `touch .claude/.review-marker`
# releases the gate; editing product code again makes the marker stale and
# re-arms it (so further edits force a fresh review).
#
# Scope note: spec files and test helpers are deliberately NOT gated — those are
# the tests themselves, iterated on constantly during development.

set -uo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

# Only gate genuine test runs. Exclude seed / schema-check / test-plan generation.
if printf '%s' "$cmd" | grep -Eq 'test-plan'; then
  exit 0
fi
if ! printf '%s' "$cmd" | grep -Eq '(playwright test)|(npm (run )?test([[:space:]:]|$))'; then
  exit 0
fi

repo="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$repo" 2>/dev/null || exit 0

mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }

# Product surfaces whose uncommitted changes require review before a test run.
dirty="$(git status --porcelain -- index.html tests-playwright/migrations supabase/functions 2>/dev/null | cut -c4-)"
[ -z "$dirty" ] && exit 0   # no product changes -> nothing to review, allow

newest=0
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] || continue
  m="$(mtime "$f")"
  [ "$m" -gt "$newest" ] && newest="$m"
done <<EOF
$dirty
EOF

marker="$repo/.claude/.review-marker"
mm=0
[ -f "$marker" ] && mm="$(mtime "$marker")"

if [ "$mm" -ge "$newest" ]; then
  exit 0   # reviewed since the last product edit -> allow
fi

changed="$(printf '%s' "$dirty" | tr '\n' ' ')"
reason="Review-before-tests gate: product files changed since the last review -> ${changed}. Run /code-review, then /security-review if payments/auth/DB/Edge Functions changed. When both pass, run:  touch .claude/.review-marker  then re-run the tests. (Spec/helper-only edits are not gated.)"
jq -cn --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
