#!/usr/bin/env bash
# Ολόκληρη η ροή σε dry-run, όπως στο Actions: νύχτα → εγκρίσεις → νύχτα ... → export (πρέπει να
# μπλοκαριστεί όσο τα κανάλια είναι pending) → εβδομαδιαία αναφορά. Χωρίς κλειδιά, χωρίς δίκτυο.
set -euo pipefail

F="npm run --silent factory --"
rm -rf .dry-run

for round in 1 2 3 4 5 6 7; do
  echo "::group::γύρος $round: run-night"
  $F run-night --dry-run
  echo "::endgroup::"
  waiting=$($F status --all --dry-run | awk '/περιμένει gate/ {print $1}')
  if [[ -z "$waiting" ]]; then break; fi
  for cell in $waiting; do
    $F decide "$cell" approved --by ci-dry-run --dry-run >/dev/null
  done
  $F sync-approvals --dry-run >/dev/null
done

echo "::group::status"
$F status --all --dry-run | grep -v ' queued ' || true
echo "::endgroup::"

approved=$($F status --all --dry-run | awk '$4 == "campaign_approved" {print $1}')
if [[ -z "$approved" ]]; then
  echo "::error::Κανένα κελί δεν έφτασε σε campaign_approved στο dry-run."
  exit 1
fi

# Το export ΠΡΕΠΕΙ να μπλοκάρεται: κανένα κανάλι outbound δεν είναι approved στο LEGAL_STATUS.md.
db=".dry-run/data/leads.sqlite"
campaigns=$(node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$db');for(const r of d.prepare(\"select id from campaigns where status='approved'\").all())console.log(r.id)" 2>/dev/null)
if [[ -z "$campaigns" ]]; then
  echo "::error::Δεν βρέθηκαν εγκεκριμένες καμπάνιες στη βάση του dry-run."
  exit 1
fi
for c in $campaigns; do
  set +e
  $F export "$c" --dry-run
  code=$?
  set -e
  if [[ $code -ne 2 ]]; then
    echo "::error::Το export της $c δεν μπλοκαρίστηκε (exit $code)."
    exit 1
  fi
done

$F record pilot "$(echo "$approved" | head -1)" --by ci-dry-run --dry-run
$F weekly --week "$(date -u +%G-W%V)" --dry-run
ls .dry-run/reports/*-W*.md
echo "✓ dry-run: ροή ως το Gate 4, export μπλοκαρισμένο, εβδομαδιαία αναφορά."
