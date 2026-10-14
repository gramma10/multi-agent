#!/usr/bin/env bash
# Βάζει το working tree στο branch του state (factory/state), ενημερωμένο με το main.
# Ο orchestrator δεν γράφει ποτέ στο main: το state πάει σε αυτό το branch και από εκεί σε PR.
set -euo pipefail

BRANCH="${STATE_BRANCH:-factory/state}"
BASE="${BASE_BRANCH:-main}"

git config user.name "auragram-factory[bot]"
git config user.email "factory-bot@users.noreply.github.com"
git fetch --no-tags origin "$BASE"

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git fetch --no-tags origin "$BRANCH"
  git checkout -B "$BRANCH" "origin/$BRANCH"
  # Αλλαγές των ιδρυτών στο main (config, εγκεκριμένα PRs) μπαίνουν πριν τρέξει ο orchestrator.
  if ! git merge --no-edit "origin/$BASE"; then
    git merge --abort || true
    echo "::error::Σύγκρουση ανάμεσα σε $BASE και $BRANCH. Λύστε τη τοπικά (git merge $BASE στο $BRANCH) και ξανατρέξτε."
    exit 1
  fi
else
  git checkout -B "$BRANCH" "origin/$BASE"
fi
echo "state branch: $BRANCH ($(git rev-parse --short HEAD))"
