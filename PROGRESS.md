# Πρόοδος

Μία ενότητα ανά φάση της §9 του brief. Η πιο πρόσφατη στην κορυφή.

| Φάση | Status |
|---|---|
| 1. Σκελετός και κανόνες | ✅ |
| 2. Orchestrator | ✅ |
| 3. Showcase app + 3 demos | ✅ (περιμένει Gate 1) |
| 4. Content pipeline | ⏳ |
| 5. Leads σε όγκο | — |
| 6. Campaigns + QA + export | — |
| 7. Tracker και βρόχος μάθησης | — |
| 8. Χρονοπρογραμματισμός και παράδοση | — |

---

## Φάση 3: Showcase app και τα πρώτα 3 demos (2026-10-14)

### Τι ολοκληρώθηκε
- **`showcase/`**: Next.js 16.4 (App Router, Turbopack), TypeScript, χωρίς UI βιβλιοθήκες, χωρίς web fonts. `/` hub με φίλτρα ανά κλάδο/υπηρεσία, `/demos/<slug>` στατικές σελίδες, `/api/live`, `robots.txt`, `sitemap.xml`, 404.
- **Κοινά components**: `DemoShell` (badge «Demo: ενδεικτικά δεδομένα», οδηγία, ΠΡΙΝ→ΜΕΤΑ, KPI pilot, CTA, share), `ChatSimulator` (Viber/WhatsApp/Messenger/Instagram/webchat, με panel «Τι βλέπεις εσύ» για την επιχείρηση), `BookingFlow` (με υπενθύμιση Viber και λίστα αναμονής), `DashboardDemo`, `AutomationFlow`, `BeforeAfter`. Ένα νέο demo είναι ένα αρχείο config.
- **3 demos**, το καθένα με brief από έρευνα:
  1. `kommotiria-booking`: κράτηση σε 4 βήματα → υπενθύμιση στο Viber → «Θέλω αλλαγή» → η ώρα πάει στη λίστα αναμονής.
  2. `iatreia-support`: Viber του ιατρείου: ωράριο, ΕΟΠΥΥ, ραντεβού ως αίτημα προς τη γραμματεία, και «πόνος στο στήθος» → καμία ιατρική συμβουλή, 166/112, προώθηση σε άνθρωπο.
  3. `xenodocheia-sales`: ερώτημα σε EN/DE/IT/EL → απάντηση στη γλώσσα του επισκέπτη, link απευθείας κράτησης, κάρτα lead στα ελληνικά για τον ιδιοκτήτη.
- **Live AI** (προαιρετικό): Anthropic SDK, rate limit ανά IP, όριο κόστους ανά ημέρα, κλειστό χωρίς κλειδί.
- **Orchestrator**: ο Builder τώρα τρέχει μόνος του typecheck, lint και το Playwright test του demo· ανεβάζει το demo σε `demo/<slug>` και ανοίγει draft PR (με `FACTORY_PUBLISH_BRANCHES=1`)· worker `prepared` για outputs γραμμένα από άνθρωπο/session· gates που άνοιξαν τοπικά ξανανοίγουν ως GitHub issues όταν συνδεθεί το GitHub.
- **Ροή μέσα από τον orchestrator**: τα 3 κελιά πέρασαν το βήμα scout (κανονική λειτουργία, όχι dry-run) και περιμένουν στο **Gate 1**, ορατά στο `review/REVIEW.md`.

### Τι ελέγχθηκε και πώς
- `cd showcase && npm run typecheck && npm run lint && npm run build`: ok.
- `npx playwright test`: **18/18** σε 390×844. Τα 3 demos τρέχουν σε πραγματική ταχύτητα και ολοκληρώνονται κάτω από 60″ (assert), με badge, ΠΡΙΝ→ΜΕΤΑ και CTA. Επίσης: hub και φίλτρα, noindex στα πρόχειρα, 404, live AI κλειστό χωρίς κλειδί, τα 2 components χωρίς demo, budget απόδοσης (LCP < 1.5s, JS < 250 KB) σε 4 σελίδες, κανένα οριζόντιο scroll.
- Screenshots στα 390px: βρέθηκε και διορθώθηκε ότι οι μεγάλες επιλογές στο chat κόβονταν δεξιά.
- `cd orchestrator && npm run check`: **69/69** (νέα: δημοσίευση σε branch με πραγματικό git και bare remote, άρνηση push στο main, builder που αποτυγχάνει αν αποτύχει το Playwright, worker prepared, μεταφορά gates σε GitHub).
- `npm run factory -- cell <id> scout --worker prepared` για τα 3 κελιά: βαθμολογίες 8, 8, 9/10, 5 πηγές το καθένα.

### Τι ΔΕΝ ελέγχθηκε
- Τα briefs και τα demos **δεν** τα έγραψε νυχτερινός worker (D020). Οι πηγές βρέθηκαν από αναζήτηση αλλά οι σελίδες δεν άνοιξαν (D021): τα briefs λένε ποιες να ελεγχθούν.
- Σε πραγματικό κινητό και μέσα στον browser του Instagram: όχι, μόνο Chromium 390px.
- Live AI με πραγματικό κλειδί: όχι.
- Το PR ανά demo δεν άνοιξε στην πράξη (το repo δεν είναι προσβάσιμο από αυτή τη session). Ελέγχθηκε με τοπικό bare remote.

### Αποφάσεις
D020–D025: πώς γράφτηκαν τα πρώτα demos, πηγές χωρίς άνοιγμα σελίδων, live AI μόνο με Anthropic, budget με Playwright, `published.json`, branch ανά demo.

### Τι χρειάζομαι από τους ιδρυτές
- **Gate 1 για τα 3 κελιά**: διαβάστε τα `pipeline/<id>/brief.md` και αποφασίστε (τοπικά: `npm run factory -- decide <id> approved --by <όνομα>`).
- Vercel project για το `showcase/` (Root Directory: `showcase`), και `NEXT_PUBLIC_BOOKING_URL` με το Cal.com link.

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
