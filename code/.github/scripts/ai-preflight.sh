#!/usr/bin/env bash
# Deterministic gate for AI write workflows. Runs BEFORE Claude, outside its control.
# Fails closed: any check that cannot be confirmed stops the run.
set -euo pipefail
: "${GH_TOKEN:?}" "${REPO:?}" "${WORKFLOW_FILE:?}"
DAILY_LIMIT="${DAILY_LIMIT:-5}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"

# 1. main must be protected by GitHub itself (classic protection or a ruleset).
#    The tool deny-list inside the workflow is NOT treated as protection.
protected=$(gh api "repos/$REPO/branches/main" --jq '.protected' 2>/dev/null) || protected=false
rules=$(gh api "repos/$REPO/rules/branches/main" --jq 'map(.type) | join(",")' 2>/dev/null) || rules=
if [[ "$protected" != "true" ]] && [[ "$rules" != *pull_request* ]]; then
  echo "::error::main is not protected (protected=$protected rules='$rules'). AI write workflows stay disabled."
  exit 1
fi

# 2. Daily task limit for this workflow (UTC day).
today=$(date -u +%Y-%m-%d)
runs=$(gh run list -R "$REPO" --workflow "$WORKFLOW_FILE" --created ">=$today" --limit 100 --json databaseId --jq 'length')
if (( runs > DAILY_LIMIT )); then
  echo "::error::Daily limit reached ($runs runs today, limit $DAILY_LIMIT)."
  exit 1
fi

# 3. Correction attempts per issue/PR, tracked with labels ai:attempt-N.
if [[ -n "${ITEM_NUMBER:-}" ]]; then
  n=$(gh issue view "$ITEM_NUMBER" -R "$REPO" --json labels \
        --jq '[.labels[].name | select(startswith("ai:attempt-")) | ltrimstr("ai:attempt-") | tonumber] | max // 0')
  if (( n >= MAX_ATTEMPTS )); then
    echo "::error::#$ITEM_NUMBER already had $n AI attempts (max $MAX_ATTEMPTS). Needs a human."
    gh issue edit "$ITEM_NUMBER" -R "$REPO" --add-label needs-human-review >/dev/null || true
    exit 1
  fi
  next=$((n + 1))
  gh label create "ai:attempt-$next" -R "$REPO" --color BFD4F2 --force >/dev/null
  gh issue edit "$ITEM_NUMBER" -R "$REPO" --add-label "ai:attempt-$next" >/dev/null
fi
echo "preflight ok"
