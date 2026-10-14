# Πρόοδος

Μία ενότητα ανά φάση της §9 του brief. Η πιο πρόσφατη στην κορυφή.

| Φάση | Status |
|---|---|
| 1. Σκελετός και κανόνες | ✅ |
| 2. Orchestrator | ✅ |
| 3. Showcase app + 3 demos | ✅ (περιμένει Gate 1) |
| 4. Content pipeline | ✅ (περιμένει Gates 1–3) |
| 5. Leads σε όγκο | ✅ (χωρίς πραγματικά κλειδιά) |
| 6. Campaigns + QA + export | ✅ (export μπλοκαρισμένο μέχρι νομική έγκριση) |
| 7. Tracker και βρόχος μάθησης | ✅ |
| 8. Χρονοπρογραμματισμός και παράδοση | ✅ (CI πράσινο στο Actions) |

---

## Φάση 8: Χρονοπρογραμματισμός και παράδοση (2026-10-14)

### Τι ολοκληρώθηκε
- **GitHub Actions** στο `.github/workflows/`:
  - `factory-night.yml` (κάθε βράδυ), `factory-morning.yml` (κάθε πρωί), `factory-weekly.yml` (Δευτέρα: Cal.com, αναφορά, retention), με κοινό `concurrency` group `factory-state` και χειροκίνητη εκτέλεση με dry-run ως προεπιλογή (D050).
  - `ci.yml`: orchestrator (lint, typecheck, tests), showcase (lint, typecheck, build, Playwright 390px), έλεγχος προσωπικών δεδομένων σε όλο το repo, και όλη η ροή σε dry-run (D051).
- **State στο `factory/state`** με ένα draft PR προς το `main`, ποτέ push στο `main` (D049). Scripts: `scripts/ci/prepare-state.sh`, `commit-state.sh`, `install-workers.sh` (μόνο όσοι workers έχουν secret), `dry-run-e2e.sh`.
- **README**: πίνακας workflows, πίνακας secrets (τι κάνει το καθένα και τι γίνεται χωρίς αυτό), ρυθμίσεις GitHub, repo variables, εναλλακτική με scheduled routines με τα ίδια scripts, και η ενότητα «Τι πρέπει να κάνουν οι ιδρυτές».

### Τι ελέγχθηκε και πώς
- `actionlint` 1.7.7 και στα 4 workflows: καθαρό (βρήκε 3 λάθη YAML, διορθώθηκαν).
- `bash scripts/ci/dry-run-e2e.sh` τοπικά: πράσινο σε ~1,5 λεπτό. Κελιά φτάνουν ως `campaign_approved`, κάθε export (email, κλήσεις, DM) μπλοκάρεται με exit 2 και τη λίστα των λόγων, pilot και εβδομαδιαία αναφορά γράφονται.
- `prepare-state.sh` / `commit-state.sh` απέναντι σε τοπικό bare remote: πρώτο run φτιάχνει το `factory/state` από το `main`· αλλαγή στο `main` μπαίνει με merge στο δεύτερο run· «καμία αλλαγή» δεν κάνει commit· `STATE_BRANCH=main` αρνείται με exit 1.
- `npm run check` (orchestrator): 128/128. `node scripts/check-personal-data.mjs --all`: καθαρό.
- **Στο GitHub Actions** (run 1 του `ci.yml`, https://github.com/gramma10/multi-agent/actions/runs/38632681776): `orchestrator`, `showcase` (με Playwright), `personal-data` και `dry-run` όλα πράσινα. Αυτό είναι το κριτήριο της φάσης.

### Τι ΔΕΝ ελέγχθηκε
- Τα scheduled workflows (νύχτα, πρωί, Δευτέρα) δεν έχουν τρέξει ακόμα: περιμένουν τη σειρά τους ή χειροκίνητο Run workflow. Το πραγματικό run χρειάζεται `main` (για το `factory/state`) και secrets.
- Η εγκατάσταση των CLIs (`@anthropic-ai/claude-code`, `@openai/codex`, `@google/gemini-cli`) στο Actions και ένα πραγματικό run με `CLAUDE_CODE_OAUTH_TOKEN`.
- Το job `showcase` του CI σε runner του GitHub (τοπικά περνά: 24/24 Playwright).

### Αποφάσεις
D049–D051.

### Τι χρειάζομαι από τους ιδρυτές
- **Branch `main`** στο repo: δεν υπάρχει ακόμα (το πρώτο branch που ανέβηκε ήταν το `claude/wonderful-davinci-im3lie`). Χωρίς αυτό δεν ανοίγει PR και τα factory workflows δεν έχουν βάση για το `factory/state`.
- Τα υπόλοιπα στο README → «Τι πρέπει να κάνουν οι ιδρυτές».

---

## Φάση 7: Tracker και βρόχος μάθησης (2026-10-14)

### Τι ολοκληρώθηκε
- **Εισαγωγή events** (`track-import`): CSV από Instantly, Smartlead, lemlist (στήλες από συνώνυμα) και Cal.com, API του Cal.com (`track-calcom`), χειροκίνητα pilots/κλήσεις (`record`). Idempotent. Στη βάση δεν γράφεται ούτε email ούτε κείμενο απάντησης (D041).
- **Suppression αμέσως**: διαγραφή ή spam complaint → email + domain (+ ΑΦΜ της επιχείρησης), hard bounce → email. Ισχύει και για events που δεν ταίριαξαν με lead.
- **Κατηγοριοποίηση απαντήσεων**: status του εργαλείου, κανόνες για διαγραφή/εκτός γραφείου, LLM (agent tracker) για τα υπόλοιπα με κρυμμένα στοιχεία (D042).
- **Μετρικές** ανά καμπάνια, κελί και κανάλι: επαφές, bounce, opens, θετικές/αρνητικές/άλλες απαντήσεις, διαγραφές, spam, κλήσεις, pilots.
- **Αυτόματο πάγωμα**: bounce > 3% ή spam > 0.1% μετά από 50 αποστολές → `frozen`, export μπλοκαρισμένο, `[ALERT]` issue. Ξεπάγωμα μόνο από άνθρωπο (`unfreeze`), με baseline (D044).
- **Priority στο matrix.yaml** (μόνο το πεδίο priority): άνοδος από κλήσεις/pilots/θετικές, διάχυση στον κλάδο, πτώση χωρίς απόκριση μετά από 200 επαφές email, όριο ±15 την εβδομάδα, idempotent ανά εβδομάδα (D045, D048).
- **Εβδομαδιαία αναφορά** `reports/YYYY-WW.md` (`weekly`): σύνοψη 3 γραμμών, πίνακες εβδομάδας και συνόλου, παγωμένες καμπάνιες, αλλαγές priority με λόγο, πρόταση για την επόμενη εβδομάδα, «πολύ λίγα δεδομένα» όταν ισχύει. Μόνο αθροίσματα, γραμμένη από κώδικα (D046).
- **Βήμα `track`** στο pipeline: `exported → tracking → done`, έλεγχος ορίων κάθε νύχτα, κλείσιμο μετά από 30 ήσυχες ημέρες (D047).

### Τι ελέγχθηκε και πώς
- `cd orchestrator && npm run check`: **128/128**. Νέα: CSV parser, ISO εβδομάδες, κανόνες κατηγοριοποίησης, LLM με κρυμμένα στοιχεία, Cal.com API με σελίδες και 401, προσομοίωση, βήμα track ως το `done`.
- **Κριτήριο της φάσης** (test με fixture events, 3 κελιά, 670 επαφές):
  - κομμωτήρια: 300 αποστολές, 6 bounces, 90 opens, 8 θετικές, 4 αρνητικές, 1 εκτός γραφείου, 2 διαγραφές, 3 κρατήσεις (1 ακυρωμένη και 1 άγνωστη αγνοούνται) → στην αναφορά ακριβώς `300 | 2.0% | 30% | 8 | 4 | 1 | 2 | 0 | 3 | 0`, priority 50 → 65 (31 κόβεται στο +15), τα άλλα κελιά του κλάδου +6.
  - ιατρεία: 6% bounce + 1 spam → παγώνει, [ALERT], export μπλοκάρεται· 250 επαφές χωρίς θετική → 60 → 50.
  - ξενοδοχεία: 120 επαφές (κάτω από το όριο κρίσης) + 1 pilot → 40 → 50, τα άλλα κελιά του κλάδου +2.
  - Το ίδιο CSV δεύτερη φορά: 0 νέα. Η αναφορά δεύτερη φορά: καμία διπλή αλλαγή. Καμία διεύθυνση email στην αναφορά ή στα events.
  - Ξεπάγωμα χωρίς όνομα αρνείται· με όνομα, το guard δεν ξαναπαγώνει από τα παλιά νούμερα.
- Από το CLI σε dry-run: `record pilot`, `weekly`, `unfreeze` (άγνωστη καμπάνια → σφάλμα).

### Τι ΔΕΝ ελέγχθηκε
- Πραγματικά CSV από Instantly/Smartlead/lemlist: οι στήλες τους αναγνωρίζονται από συνώνυμα, όχι από δείγμα αρχείου. Με το πρώτο πραγματικό export ίσως χρειαστεί ένα συνώνυμο ακόμα (μία γραμμή στο `src/tracker/events.ts`).
- Cal.com API με πραγματικό κλειδί (D043).
- Η κατηγοριοποίηση με πραγματικό LLM.

### Αποφάσεις
D040–D048.

### Τι χρειάζομαι από τους ιδρυτές
- `CAL_API_KEY` αν θέλετε αυτόματη εισαγωγή κρατήσεων (αλλιώς CSV export).
- Όταν τρέχει καμπάνια: εισαγωγή events τουλάχιστον μία φορά τη μέρα, ώστε οι διαγραφές να μπαίνουν γρήγορα στη suppression.

---

## Φάση 6: Campaigns + QA + export (2026-10-14)

### Τι ολοκληρώθηκε
- **Templates ανά κανάλι** (email 3 αγγίγματα σε 10 ημέρες, σενάριο κλήσης, DM, συνεργάτες) με schema και έλεγχο ότι κάθε σύνολο variants έχει `default`. Γράφτηκαν και τα πραγματικά templates για τα 3 κελιά.
- **Προσωποποίηση μόνο από πεδία με πηγή** (`src/campaigns/render.ts`): συνθήκες `πεδίο == τιμή`, placeholders, γενική εκδοχή όταν κάτι λείπει (D037). Κάθε μήνυμα: link στο demo με UTM, CTA Χάρτη AI, στοιχεία αποστολέα, προσωπικό link διαγραφής.
- **Campaign builder**: μία καμπάνια ανά κανάλι, τα καλύτερα leads με το σωστό στοιχείο επικοινωνίας, suppression (2ο σημείο), μέλη στη βάση.
- **QA**: Q1–Q10 ντετερμινιστικά σε όλα τα μηνύματα + LLM (QA agent) στα μοναδικά κείμενα (D036). Αναφορά με pass rate, απορρίψεις ανά κανόνα και τυχαίο δείγμα 25 (αναπαράγεται), κρυμμένο στο git και πλήρες τοπικά (D038). Κάτω από το όριο → ξαναγράφεται με feedback, το πολύ `max_qa_rounds`.
- **Gate 4**: η έγκριση γράφεται στις καμπάνιες (approved_by, approved_at).
- **Export** (`factory -- export <id> --tool instantly|smartlead|lemlist`): CSV για τα 3 εργαλεία, λίστα κλήσεων με σενάριο ανά επιχείρηση, πρόχειρα DM σε markdown. Μόνο χειροκίνητα (D034), ένα batch = όριο μιας ημέρας (D035), suppression ξανά ακριβώς πριν το αρχείο (3ο σημείο).
- **Compliance gate**: διπλό κλειδί για το κανάλι (`channels.yaml` + `LEGAL_STATUS.md` με ημερομηνία και όνομα), Gate 4, όχι παγωμένη καμπάνια, inboxes/ramp-up, `config/sending-domains.yaml` με SPF/DKIM/DMARC και άρνηση κύριου domain και δωρεάν παρόχων, μητρώο αντιρρήσεων για κλήσεις (D039). Δείχνει όλους τους λόγους μαζί.

### Τι ελέγχθηκε και πώς
- `cd orchestrator && npm run check`: **117/117**. Νέα: συνθήκες και variants, κάθε κανόνας Q1–Q10 ξεχωριστά, LEGAL_STATUS (approved χωρίς υπογραφή = pending), DNS (λείπει DKIM/DMARC, κύριο domain και υποτομέας του, gmail), ramp-up, μητρώο αντιρρήσεων, τα πραγματικά templates των 3 κελιών περνούν το QA με και χωρίς προσωποποίηση, ροή μέσα από τον orchestrator ως το Gate 4 με την έγκριση γραμμένη στη βάση.
- **Κριτήριο της φάσης** (test): καμπάνια email **1.000 leads × 3 αγγίγματα = 3.000 μηνύματα**, QA ≥ 95%, δείγμα 25. Export με κανάλι pending: **μπλοκάρεται**, χωρίς αρχείο. Με κανάλι approved (και στα δύο αρχεία), 10 inboxes ζεσταμένα, domain με σωστό DNS: **ξεμπλοκάρει**, 400 γραμμές (10 × 40), το μέλος που ζήτησε διαγραφή λίγο πριν δεν είναι μέσα, δεύτερο batch άλλα 400 χωρίς επανάληψη, και παγωμένη καμπάνια μπλοκάρεται ξανά.
- Dry-run από το CLI: τα 3 exports (email, κλήσεις, DM) μπλοκάρονται με τη λίστα των λόγων.
- Το QA έπιασε 4 πραγματικά προβλήματα στην πορεία: επωνυμίες ΓΕΜΗ σε κεφαλαία μέσα σε μήνυμα, placeholder που δεν γέμιζε (D037), ένα test που έβαζε όνομα κομμωτηρίου σε καμπάνια ιατρείων (Q3), τη λέξη «επείγον» σε email για ιατρεία (άλλαξε η διατύπωση).

### Τι ΔΕΝ ελέγχθηκε
- Τα CSV δεν έχουν ανέβει σε πραγματικό Instantly/Smartlead/lemlist: οι στήλες ακολουθούν τις βασικές τους συμβάσεις, οι προσωπικές μεταβλητές μπαίνουν ως custom columns. Μπορεί να χρειαστεί αντιστοίχιση στο import του εργαλείου.
- Πραγματικό DNS lookup (μόνο με fake resolver).
- Το LLM QA με πραγματικό μοντέλο (σε dry-run απαντά fixture).
- Το List-Unsubscribe header το στήνει το εργαλείο αποστολής· εμείς δίνουμε `unsubscribe_url` ανά παραλήπτη. Η σελίδα διαγραφής (που γράφει στη suppression) δεν υπάρχει ακόμα.

### Αποφάσεις
D034–D039.

### Τι χρειάζομαι από τους ιδρυτές
- Στοιχεία αποστολέα στο `config/channels.yaml` → `sender` (χωρίς αυτά κάθε μήνυμα κόβεται στο Q9).
- Όλα τα υπόλοιπα για email/κλήσεις περιμένουν τη γνώμη του δικηγόρου.

---

## Φάση 5: Leads σε όγκο (2026-10-14)

### Τι ολοκληρώθηκε
- **Supabase migration** (`supabase/migrations/20261014000001_leads.sql`): businesses, contacts, cell_leads, campaigns, campaign_members, events, suppression, consents, gdpr_requests, lead_cursors, api_cache, lead_daily. RLS ενεργό σε όλους, χωρίς policies. Ίδιο schema σε SQLite για dry-run (D029).
- **Adapters με fixtures**: Google Places (New) Text Search, ΓΕΜΗ open data (D031), website (robots.txt, 1 αίτημα/δευτ. ανά domain, μόνο αρχική + επικοινωνία). Όλοι πάνω σε injectable HTTP client· σε dry-run τους απαντά ένας `FakeWorld` με χιλιάδες φανταστικές επιχειρήσεις (`.example`, ΑΦΜ 9999…), οπότε τρέχει ο ίδιος κώδικας parsing.
- **Pipeline**: κανονικοποίηση (E.164, domains, ονόματα χωρίς τόνους/νομική μορφή), suppression (πριν και μετά τον εμπλουτισμό, με propagation: D033), εμπλουτισμός, dedupe (ΑΦΜ → ΓΕΜΗ → domain → τηλέφωνο → όνομα+πόλη: D030), scoring 0–100 με λόγους, `source` + `collected_at` σε κάθε πεδίο, batches με cursor ανά query (resume), cache 30 ημερών, όριο `leads_per_day` ακριβές.
- **Βήμα leads** στον orchestrator: `published → lead_sourcing → leads_ready`· αν σταματήσει στο όριο ημέρας μένει σε `lead_sourcing` και συνεχίζει την επόμενη νύχτα. Αναφορά `pipeline/<id>/campaign/leads-stats.md` μόνο με αθροίσματα.
- **Εντολές**: `leads <id> [--city] [--limit]`, `suppress`, `gdpr-erase` (σβήνει παντού, μένει μόνο hash), `gdpr-export`, `retention` (ανωνυμοποίηση μετά από `leads_retention_months`).
- **Pre-commit check** (`scripts/check-personal-data.mjs`, `.githooks/pre-commit`, `npm run setup-hooks`): μπλοκάρει αρχεία δεδομένων με emails/τηλέφωνα και κείμενα με 5+ πραγματικά emails ή τηλέφωνα. `npm run check:personal-data` για όλο το repo (για το CI).

### Τι ελέγχθηκε και πώς
- `cd orchestrator && npm run check`: **94/94**. Νέα: κανονικοποίηση, robots.txt (μόνο 1 αίτημα όταν απαγορεύει), εξαγωγή από HTML, dedupe και στις 5 διαδρομές με διατήρηση της αρχικής πηγής, suppression και με hash, gdpr-erase (άδειοι 5 πίνακες, μόνο hash στη suppression), retention, scoring, ισοδυναμία schema SQLite ↔ Postgres και RLS σε κάθε πίνακα, suppression ανάμεσα σε πηγές, βήμα leads με όριο ημέρας και συνέχεια σε επόμενες μέρες, καθαρή αποτυχία χωρίς κλειδιά και στο CI χωρίς βάση.
- **Κριτήριο της φάσης** (test): κόσμος 5.400 επιχειρήσεων → 7.600+ εγγραφές από τις πηγές → **5.200+ μοναδικές**, ίσες ακριβώς με την «αλήθεια» του fixture μείον τις 30 suppressed, **μηδέν** διπλότυπα σε ΑΦΜ / ΓΕΜΗ / domain / τηλέφωνο / όνομα+πόλη, κανένα προσωπικό email, κανένα κινητό από το ΓΕΜΗ, πηγή σε κάθε πεδίο, μέσος όρος score ψηλότερος για όσους δεν έχουν online κράτηση. Χρόνος: ~8–13″ σε SQLite.
- Βρέθηκαν και διορθώθηκαν από τα tests: suppressed επιχειρήσεις ξανάμπαιναν από άλλη πηγή (D033)· το όριο ημέρας ξεπερνιόταν κατά μία σελίδα.
- `npm run check:personal-data`: καθαρό repo· μπλοκάρει ένα CSV με 1 email και ένα .md με 5 emails (δοκιμή με staged αρχεία).

### Τι ΔΕΝ ελέγχθηκε
- **Τίποτα με πραγματικά κλειδιά** (Places, ΓΕΜΗ) ή πραγματική βάση Supabase. Το «1 πόλη × 1 κλάδο με πραγματικά κλειδιά» μένει για όταν υπάρξουν: `npm run factory -- leads kommotiria-booking --city Αθήνα --limit 20`.
- Ο adapter του ΓΕΜΗ: host και παράμετροι είναι υπόθεση (D031).
- Ο driver Postgres γράφτηκε αλλά δεν έτρεξε ποτέ.
- Το scoring είναι κρίση, όχι μοντέλο. Θα το διορθώσει ο tracker με πραγματικά αποτελέσματα.

### Αποφάσεις
D029–D033: Postgres/SQLite, dedupe με όνομα+πόλη, ΓΕΜΗ ως υπόθεση, τι κρατάμε από websites, suppression που κλειδώνει όλη την επιχείρηση.

### Τι χρειάζομαι από τους ιδρυτές
- `GOOGLE_PLACES_API_KEY`, `GEMI_API_KEY`, Supabase project + `SUPABASE_DB_URL`, και εκτέλεση του migration.
- Γνώμη δικηγόρου για τη νομική βάση συλλογής (ερώτηση 3 στο `compliance/LEGAL_STATUS.md`) **πριν** τρέξει πραγματική προμήθεια leads.
- `npm run setup-hooks` σε κάθε υπολογιστή που κάνει commits.

---

## Φάση 4: Content pipeline (2026-10-14)

### Τι ολοκληρώθηκε
- **Περιεχόμενο για τα 3 demos** στο `pipeline/<slug>/content/`: `page.md` (σελίδα demo), `reel.md` (3 scripts για Reels με hook στα 2″, σκηνές, κείμενο οθόνης, CTA), `loom.md` (walkthrough 90″), `linkedin.md`, `seo-section.md`. Και εισαγωγές κλάδων στο `pipeline/_verticals/<κλάδος>/intro.md` για κομμωτήρια, ιατρεία, ξενοδοχεία. Γράφτηκαν στη session (ρόλος Content agent), όπως τα demos (D020).
- **Έλεγχος περιεχομένου** στον orchestrator (D028): μορφή κάθε αρχείου, μαύρη λίστα του brand, φράσεις που υπονοούν πελάτες, νούμερα χωρίς πηγή. Το βήμα content αποτυγχάνει αν δεν περνά.
- **Δημοσίευση**: στο Gate 3 (approved) ο orchestrator γράφει το `showcase/content/published.json`· πριν από αυτό το περιεχόμενο φαίνεται μόνο ως πρόχειρο σε preview (D026). Νέα εντολή `factory -- sync-content`. Το issue του Gate 3 περιέχει τη σελίδα και τα Reels.
- **Showcase**: κάτω από κάθε demo το κείμενο του `page.md`· σελίδες `/lyseis/<κλάδος>` (εισαγωγή + ενότητα ανά demo + link + CTA), μόνο για κλάδους με ορατά demos, χωρίς σελίδες ανά πόλη· links κλάδων στο hub· sitemap με ό,τι είναι δημοσιευμένο. Markdown χωρίς raw HTML (D027).

### Τι ελέγχθηκε και πώς
- `cd orchestrator && npm run check`: **77/77**. Νέα: η μαύρη λίστα διαβάζεται από το brand.md, εντοπισμός φράσεων/νούμερων, τα 3 πραγματικά packs και οι 3 εισαγωγές περνούν, ένα κακό pack πιάνεται σε 11 σημεία, **πλήρης ροή dry-run idea → demo → content → Gate 3 → published.json**, content με «οι πελάτες μας… 300%» δεν φτάνει ποτέ στο Gate 3 ούτε στη showcase.
- `cd showcase && npx playwright test`: **24/24** (νέα: κείμενο σελίδας demo, 3 σελίδες κλάδου, links από το hub, 404 για άγνωστο κλάδο). 3 συνεχόμενα runs πράσινα.
- Βρέθηκε και διορθώθηκε: το budget JS ταλάντευε γύρω από το όριο επειδή μετρούσε ασυμπίεστα και μαζί το prefetch άλλων σελίδων. Τώρα μετρά μόνο την πρώτη φόρτωση, με gzip, με όριο 200 KB (σήμερα όλα τα chunks μαζί ~186 KB).
- Χειροκίνητα, σε production build **χωρίς** drafts: με κενό `published.json` το hub δείχνει «Τα πρώτα demos έρχονται», οι σελίδες κλάδων δίνουν 404, τα demos είναι noindex, το sitemap έχει μόνο την αρχική. Με `["kommotiria-booking"]`: 1 κάρτα, `/lyseis/kommotiria` 200, `/lyseis/iatreia` 404, sitemap με demo και κλάδο. Το `/components` δίνει 404 και στις δύο.

### Τι ΔΕΝ ελέγχθηκε
- Τα 3 κελιά είναι ακόμα στο Gate 1, οπότε στην πράξη δεν έχει δημοσιευτεί τίποτα. Η δημοσίευση ελέγχθηκε σε dry-run και με το χειροκίνητο build παραπάνω.
- Τα Reel scripts δεν έχουν «δοκιμαστεί στην κάμερα». Θέλουν το μάτι σας για το αν ακούγονται φυσικά από εσάς.
- Το κείμενο των σελίδων δεν έχει ελεγχθεί από native ομιλητή πέρα από εμένα.

### Αποφάσεις
D026–D028: πρόχειρο πριν, δημόσιο μετά το Gate 3· markdown χωρίς HTML· ντετερμινιστικός έλεγχος περιεχομένου.

### Τι χρειάζομαι από τους ιδρυτές
- Gates 1 → 2 → 3 για τα 3 κελιά. Με `--worker prepared` τα βήματα build και content περνούν αμέσως από τους ελέγχους, χωρίς να ξαναγραφτεί τίποτα.

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
- `npx playwright test`: **18/18** σε 390×844. Τα 3 demos τρέχουν σε πραγματική ταχύτητα και ολοκληρώνονται κάτω από 60″ (assert), με badge, ΠΡΙΝ→ΜΕΤΑ και CTA. Επίσης: hub και φίλτρα, noindex στα πρόχειρα, 404, live AI κλειστό χωρίς κλειδί, τα 2 components χωρίς demo, budget απόδοσης (LCP < 1.5s, JS < 200 KB gzip) σε 4 σελίδες, κανένα οριζόντιο scroll.
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
