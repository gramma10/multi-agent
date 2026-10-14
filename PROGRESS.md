# Πρόοδος

Μία ενότητα ανά φάση της §9 του brief. Η πιο πρόσφατη στην κορυφή.

| Φάση | Status |
|---|---|
| 1. Σκελετός και κανόνες | ✅ |
| 2. Orchestrator | ✅ |
| 3. Showcase app + 3 demos | ⏳ |
| 4. Content pipeline | — |
| 5. Leads σε όγκο | — |
| 6. Campaigns + QA + export | — |
| 7. Tracker και βρόχος μάθησης | — |
| 8. Χρονοπρογραμματισμός και παράδοση | — |

---

## Φάση 2: Orchestrator (2026-10-14)

### Τι ολοκληρώθηκε
- `orchestrator/` σε TypeScript (Node 22, `tsx`, χωρίς build step). Εξαρτήσεις: μόνο `yaml` και `zod`.
- **State machine** της §5.1 (`src/state/machine.ts`) με κανόνες ανά actor (agent / system / human). Τα `approved_*`, `published`, `rejected` τα γράφει μόνο άνθρωπος.
- **task.yaml I/O** (`src/state/task.ts`): ατομική εγγραφή, ιστορικό κάθε μετάβασης (ποιος, πότε, worker, μοντέλο, διάρκεια, αποτέλεσμα), gates, feedback, προσπάθειες.
- **Workers** (`src/workers/`): ενιαίο `Worker.run({prompt, cwd, allowedTools, timeout}) → {output, usage, exitReason}`, adapters για `claude -p`, `codex exec`, `gemini`, fixture worker για dry-run. Αναγνώριση μηνυμάτων ορίου χρήσης ανά CLI, cooldown στο `reports/worker-state.json`, fallback, ποτέ loop επαναλήψεων, καταγραφή κάθε κλήσης στο `reports/usage.jsonl`.
- **Scope guard** (`src/scope-guard.ts`): ό,τι γράψει ένας agent εκτός scope αναιρείται, και τα προστατευμένα αρχεία (task.yaml, review/, config/, compliance/…) επαναφέρονται πάντα.
- **Εγκρίσεις**: adapter GitHub Issues μέσω `gh` (labels `approved` / `changes` / `rejected`, μόνο από approvers, έλεγχος από τα events του issue) και adapter dry-run (`review/decisions.yaml` + `factory -- decide`). Σε κάθε εκτέλεση ξαναγράφεται το `review/REVIEW.md`.
- **Kill switch** (`PAUSE` ή `FACTORY_PAUSED=true`), **lock** (`.factory.lock`), **budgets ανά νύχτα** από το `volume.yaml`, όριο εκκρεμών εγκρίσεων, όριο προσπαθειών ανά βήμα.
- **CLI** της §5.5: `status`, `next`, `run-night`, `run-morning`, `sync-approvals`, `cell <id> <step>`, `decide` (dry-run), `export` (Φάση 6). Από τη ρίζα: `npm run factory -- …`.
- Βήματα: scout (με έλεγχο μορφής του brief: ενότητες, 3–5 URLs, βαθμολογία X/10), build, content. Leads, campaign, QA, export, tracking είναι «pending» μέχρι τις φάσεις τους.

### Τι ελέγχθηκε και πώς
- `cd orchestrator && npm run check` → lint ok, typecheck ok, **63/63 tests** σε 7 αρχεία:
  - όλο το happy path και εξαντλητικός έλεγχος ότι κάθε μη επιτρεπτή μετάβαση πετά (>1.000 συνδυασμοί),
  - κανένας agent / system δεν περνά κανένα gate, από κανένα state,
  - agent που γράφει `approved_idea` στο task.yaml: αναιρείται, το βήμα αποτυγχάνει,
  - GitHub: label από bot ή από λογαριασμό εκτός λίστας αγνοείται, label που αφαιρέθηκε δεν μετράει, σχόλια μη approvers δεν περνούν ως feedback,
  - όριο στον primary → cooldown + fallback· όριο και στους δύο → καθαρό σταμάτημα χωρίς επαναλήψεις· λήξη cooldown,
  - αναγνώριση 8 μορφών μηνυμάτων ορίου από Claude / Codex / Gemini και ώρας επαναφοράς,
  - PAUSE και FACTORY_PAUSED, lock και ορφανό lock, όριο προσπαθειών, budgets.
- **Κριτήριο της φάσης:** `npm run factory -- run-night --dry-run` περνά 3 κελιά (`kommotiria-booking`, `iatreia-support`, `xenodocheia-sales`) μέχρι το Gate 1 με fixture worker, και το `REVIEW.md` τα δείχνει. Με `decide … approved` το κελί προχωρά την επόμενη νύχτα στο `demo_ready`, με `changes` ξανατρέχει ο scout με το feedback, με `rejected` πάει στο αρχείο.

### Τι ΔΕΝ ελέγχθηκε
- Οι adapters για τα πραγματικά CLI (`claude`, `codex`, `gemini`) ελέγχθηκαν με fake child process, όχι με πραγματική συνδρομή. Τα flags του `claude` επιβεβαιώθηκαν από το `claude --help` (v2.1.42). Τα flags του Codex και του Gemini είναι από την τεκμηρίωσή τους και μπορεί να θέλουν `extra_args` στο `workers.yaml`.
- Ο adapter GitHub ελέγχθηκε με fake `gh`. Δεν άνοιξε πραγματικό issue (το repo δεν είναι προσβάσιμο από αυτή τη session).

### Αποφάσεις
D013–D019: dry-run σε sandbox, scope guard, πότε τρέχει fallback, `changes` στο Gate 1, lock σε αρχείο, prompt από stdin, κανείς δεν περνά gate χωρίς approvers.

### Τι χρειάζομαι από τους ιδρυτές
- Τα GitHub logins σας στο `config/gates.yaml` → `approvers` (χωρίς αυτά κανένα gate δεν περνά στο GitHub, D019).

---

## Φάση 1: Σκελετός και κανόνες (2026-10-14)

### Τι ολοκληρώθηκε
- Δομή repo της §3. Τα αρχεία του brief (`CLOUD_SESSION_PROMPT.md`) και το διάγραμμα (`auragram-system.drawio`) στη ρίζα.
- `CLAUDE.md` με τους 8 κανόνες της §8, πίνακα «ποιος γράφει πού» και ορολογία.
- `README.md`: πώς τρέχει, πώς εγκρίνετε, πώς προσθέτετε κλάδο, χρονοπρογραμματισμός (και με routines), checklist για τους ιδρυτές (§10).
- `config/brand.md`: η §1 σε μορφή για agents, με μαύρη λίστα λέξεων, ελληνικές ιδιαιτερότητες και έλεγχο πριν από κάθε έξοδο.
- `config/matrix.yaml`: 10 κλάδοι × 6 υπηρεσίες = **60 κελιά**, το καθένα με `fit` και σημείωση για το γιατί. 18 high, 27 medium, 15 low. Κλάδοι σε μία γραμμή ο καθένας, με προθέματα ΚΑΔ και queries για το Places.
- `config/volume.yaml` (§7.5 + όρια για gates, επαναλήψεις, QA, αυτόματη προστασία), `config/channels.yaml` (6 κανάλια της §7.1 + στοιχεία αποστολέα), `config/workers.yaml` (primary/fallback/μοντέλο ανά agent), `config/gates.yaml` (approvers, labels, checklist ανά gate).
- `agents/*.md`: πλήρη specs για scout, builder, content, leads, outreach, qa, tracker. Το καθένα με ρόλο, input, ακριβές output (διαδρομή και μορφή) και κανόνες/πότε σταματά.
- `compliance/LEGAL_STATUS.md` (μόνο το inbound `approved`, τα υπόλοιπα `pending` με κενά πεδία υπογραφής + ερωτήσεις για τον δικηγόρο), `DELIVERABILITY.md`, `suppression-policy.md`.
- `.gitignore` που κρατά έξω από το git δεδομένα leads, exports, SQLite, env και το sandbox του dry-run.

### Τι ελέγχθηκε και πώς
- Όλα τα `config/*.yaml` φορτώνουν χωρίς σφάλμα (`python3 -c "yaml.safe_load(...)"`).
- `matrix.yaml`: 60 κελιά, 60 μοναδικά ids.

### Τι ΔΕΝ ελέγχθηκε
- Τα προθέματα ΚΑΔ στο `matrix.yaml` είναι υπόθεση με βάση NACE Rev.2. Πρέπει να επαληθευτούν πάνω στο ΓΕΜΗ στη Φάση 5.
- Τα specs δεν έχουν δοκιμαστεί ακόμα από πραγματικό worker (έρχεται στη Φάση 3).

### Αποφάσεις
D001–D012 στο `DECISIONS.md`. Οι πιο σημαντικές: slugs σε greeklish (D002), αρχικά priorities (D003), νέος κλάδος = μία γραμμή (D004), λίστα approvers για τα gates (D007), διπλό κλειδί για τα κανάλια (D010).

### Τι χρειάζομαι από τους ιδρυτές
- GitHub logins για το `config/gates.yaml` → `approvers`.
- Website, διεύθυνση, Cal.com link στο `config/channels.yaml` → `sender`.
- Ματιά στα `fit` του `config/matrix.yaml`: είναι κρίση, όχι δεδομένα.
