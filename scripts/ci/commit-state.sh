#!/usr/bin/env bash
# Κάνει commit το state του orchestrator στο factory/state και ανοίγει PR προς το main αν δεν υπάρχει.
# Πριν το commit τρέχει ο έλεγχος προσωπικών δεδομένων στα staged αρχεία.
set -euo pipefail

BRANCH="${STATE_BRANCH:-factory/state}"
BASE="${BASE_BRANCH:-main}"
MSG="${1:-factory: ενημέρωση state}"

if [[ "$BRANCH" == "$BASE" || "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo "::error::Άρνηση: το state δεν γράφεται ποτέ στο $BRANCH"
  exit 1
fi

git add -A
if git diff --cached --quiet; then
  echo "Καμία αλλαγή στο state."
  exit 0
fi
node scripts/check-personal-data.mjs
git commit -q -m "$MSG"
git push origin "HEAD:refs/heads/$BRANCH"

if command -v gh >/dev/null 2>&1 && [[ -n "${GH_TOKEN:-}" ]]; then
  if [[ -z "$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[].number')" ]]; then
    gh pr create --head "$BRANCH" --base "$BASE" --draft \
      --title "Factory: state (εγκεκριμένα demos, περιεχόμενο, αναφορές)" \
      --body "Αυτόματο PR του orchestrator. Ενημερώνεται κάθε βράδυ και πρωί. Κάντε merge όταν θέλετε να βγουν στο site όσα έχουν περάσει τα gates (το Vercel κάνει deploy από το $BASE). Δεν περιέχει ποτέ δεδομένα leads." || true
  fi
fi
