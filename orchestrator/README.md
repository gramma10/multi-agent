# orchestrator/

Ο κώδικας που τρέχει το factory. TypeScript, Node 22, χωρίς build step (`tsx`).

```bash
npm install
npm run check          # lint + typecheck + tests
npm run factory -- status
```

## Πώς είναι στημένο

| Αρχείο | Τι κάνει |
|---|---|
| `src/cli.ts` | οι εντολές `status`, `next`, `run-night`, `run-morning`, `sync-approvals`, `cell`, `decide`, `export` |
| `src/runner.ts` | επιλογή κελιού, βήματα, budgets ανά νύχτα, όριο προσπαθειών, kill switch, lock |
| `src/state/machine.ts` | το state machine της §5.1· οι κανόνες για το ποιος (agent / system / human) κάνει ποια μετάβαση |
| `src/state/task.ts` | `pipeline/<slug>/task.yaml`: η μόνη πόρτα για αλλαγή state (`applyTransition`) με ιστορικό |
| `src/steps/` | ένα αρχείο ανά βήμα (scout, build, content, …)· τα βήματα επόμενων φάσεων είναι «pending» |
| `src/workers/` | ενιαίο `Worker.run({prompt, cwd, allowedTools, timeout})`, adapters για `claude -p`, `codex exec`, `gemini`, fixture worker, ανίχνευση ορίων χρήσης, cooldown, fallback |
| `src/scope-guard.ts` | ελάχιστα δικαιώματα: ό,τι γράψει ένας agent εκτός του scope του αναιρείται και το βήμα αποτυγχάνει |
| `src/approvals/` | gates μέσω GitHub Issues (`gh`) ή, σε dry-run, μέσω `review/decisions.yaml` |
| `src/gates.ts`, `src/review.ts` | περιεχόμενο των gate issues και το `review/REVIEW.md` |
| `fixtures/` | τι γράφει ο fixture worker σε dry-run |

## Ασφάλεια σε 4 στρώματα

1. **State machine:** τα `approved_*`, `published` και `rejected` τα γράφει μόνο actor `human`. Κάθε άλλη προσπάθεια πετά `GateViolationError`.
2. **Gates:** στο GitHub μετράει μόνο label από λογαριασμό της λίστας `approvers` (όχι bot), ελεγμένο από τα events του issue.
3. **Scope guard:** στιγμιότυπο των αρχείων πριν από κάθε worker· μετά, ό,τι άλλαξε εκτός scope αναιρείται. Τα `task.yaml`, `review/`, `config/`, `compliance/`, `agents/`, `CLAUDE.md` επαναφέρονται πάντα byte-προς-byte.
4. **Kill switch:** αρχείο `PAUSE` ή `FACTORY_PAUSED=true`.

## Όρια χρήσης συνδρομών

Κάθε worker CLI αναγνωρίζει τα μηνύματα «usage limit / rate limit» (`src/workers/limits.ts`). Όταν εμφανιστεί κάποιο: ο worker μπαίνει σε cooldown (`reports/worker-state.json`, μέχρι την ώρα που λέει το μήνυμα, αλλιώς `default_cooldown_minutes`), ο agent περνά στον fallback, κι αν είναι κι αυτός εκτός, ο agent σταματά για απόψε. Ποτέ δεύτερη προσπάθεια στον ίδιο worker. Κάθε κλήση γράφεται στο `reports/usage.jsonl`.

## Dry-run

`--dry-run`: όλοι οι agents τρέχουν με τον fixture worker, οι εγκρίσεις πηγαίνουν στο `review/decisions.yaml`, και όλο το state (pipeline, review, reports, αντίγραφο του matrix) γράφεται στο `.dry-run/` στη ρίζα του repo, που το αγνοεί το git. Για να ξεκινήσεις από την αρχή: `rm -rf .dry-run`.

```bash
npm run factory -- run-night --dry-run
npm run factory -- decide kommotiria-booking approved --by christos --dry-run
npm run factory -- run-night --dry-run
npm run factory -- status --dry-run
```
