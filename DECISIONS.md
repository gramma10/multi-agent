# Αποφάσεις

Αποφάσεις που δεν ορίζει το brief (`CLOUD_SESSION_PROMPT.md`). Κάθε εγγραφή: ημερομηνία, απόφαση, γιατί, πώς αλλάζει.

---

### D001: Η ρίζα του repo είναι το `auragram-factory/` του brief
**2026-10-14.** Το repo `multi-agent` παίζει τον ρόλο του φακέλου `auragram-factory/` της §3. Δεν υπάρχει υποφάκελος `auragram-factory/`.
**Γιατί:** Το διάγραμμα ήδη αναφέρει «Φάκελοι στο MULTI-AGENT». Ένα επίπεδο λιγότερο.
**Αλλαγή:** μετονομασία του repo στο GitHub, χωρίς αλλαγή στον κώδικα.

### D002: Slugs με λατινικούς χαρακτήρες
**2026-10-14.** Κλάδοι: `kommotiria`, `xenodocheia`, `iatreia`, `estiasi`, `logistika`, `kataskeves`, `gymnastiria`, `mesitika`, `eshops`, `frontistiria`. Υπηρεσίες (σύντομα): `sales`, `support`, `operations`, `analyst`, `booking`, `automation`. Id κελιού: `<κλάδος>-<υπηρεσία>`, π.χ. `iatreia-support`.
**Γιατί:** Τα slugs γίνονται URLs (`/demos/<slug>`, `/lyseis/<klados>`), ονόματα φακέλων και git branches. Greeklish χωρίς τόνους είναι ασφαλή παντού και διαβάζονται από Έλληνες.
**Αλλαγή:** τα ids στο `config/matrix.yaml`. Αλλαγή id σε κελί που έχει ξεκινήσει σπάει τα links του.

### D003: Αρχικές τιμές fit και priority
**2026-10-14.** Το `fit` κάθε κελιού ορίστηκε με κρίση (σημειώσεις στο πεδίο `notes`). Αρχικό `priority` = βάση ανά fit (high 60, medium 40, low 20) + μπόνους ανά υπηρεσία με τη σειρά προτεραιότητας του brand (sales 6, support 5, operations 4, analyst 3, automation 2, booking 1). Εξαίρεση: τα 3 κελιά της Φάσης 3 πήραν 90 / 88 / 86 ώστε να περάσουν πρώτα (`kommotiria-booking`, `iatreia-support`, `xenodocheia-sales`).
**Γιατί:** Σταθερός, εξηγήσιμος κανόνας μέχρι να υπάρξουν πραγματικά δεδομένα από τον tracker.
**Αλλαγή:** αλλάζετε `fit` / `priority` στο `config/matrix.yaml`. Ο tracker θα τα μετακινεί με βάση τα αποτελέσματα.

### D004: Ο νέος κλάδος είναι μία γραμμή
**2026-10-14.** Το `config/matrix.yaml` έχει ενότητα `verticals:` με μία γραμμή ανά κλάδο. Αν ένας κλάδος δεν έχει κελιά στο `cells:`, ο orchestrator δημιουργεί αυτόματα τα 6 κελιά του με `fit: medium`, `priority: 40`.
**Γιατί:** Το brief ζητά «η προσθήκη κλάδου είναι μία γραμμή στο YAML».
**Αλλαγή:** γράφοντας ρητά κελιά στο `cells:` για τον κλάδο.

### D005: Το `changes_requested` είναι απόφαση gate, όχι ξεχωριστό state
**2026-10-14.** Όταν ο άνθρωπος βάζει `changes`, το κελί πηγαίνει απευθείας στο state εργασίας του βήματος (`building`, `content_writing`, `campaign_drafting`) και τα σχόλια γράφονται στο `pipeline/<slug>/feedback.md`. Ο agent τα διαβάζει στην επόμενη εκτέλεση.
**Γιατί:** Η §5.1 γράφει «changes_requested (→ building, με σχόλια)». Ένα ενδιάμεσο state δεν προσθέτει πληροφορία, το feedback και το ιστορικό είναι ήδη στο `task.yaml`.
**Αλλαγή:** στο `orchestrator/src/state/machine.ts`.

### D006: `rejected` επιτρέπεται σε όλα τα gates και `rejected → queued` από άνθρωπο
**2026-10-14.** Η §5.1 έχει `rejected` στα Gate 1 και 2. Το επιτρέπουμε και στα Gate 3 και 4 (ο άνθρωπος πρέπει να μπορεί να σταματήσει οτιδήποτε). Ένα απορριφθέν κελί μπορεί να ξανανοίξει μόνο από άνθρωπο (`rejected → queued`).
**Γιατί:** Ασφάλεια: κανένα κελί δεν πρέπει να «κολλάει» σε gate χωρίς τρόπο να σταματήσει.
**Αλλαγή:** στο `orchestrator/src/state/machine.ts`.

### D007: Ποιος περνά gate: λίστα approvers
**2026-10-14.** Ένα label σε gate issue μετράει μόνο αν το έβαλε λογαριασμός από το `config/gates.yaml` → `approvers`. Ο orchestrator το ελέγχει από το timeline του issue (ποιος έβαλε το label), όχι μόνο από το αν υπάρχει.
**Γιατί:** Το token του orchestrator μπορεί τεχνικά να βάλει labels. Χωρίς αυτόν τον έλεγχο, ένας agent με πρόσβαση στο `gh` θα μπορούσε να περάσει gate.
**Αλλαγή:** στο `config/gates.yaml`.

### D008: Μοντέλα ως aliases του CLI
**2026-10-14.** Στο `config/workers.yaml` τα μοντέλα είναι aliases (`opus`, `sonnet`, `haiku` για το Claude Code) ή `null` (προεπιλογή του CLI για Codex και Gemini).
**Γιατί:** Τα aliases ακολουθούν αυτόματα τη νεότερη έκδοση κάθε οικογένειας. Συγκεκριμένα ids λήγουν.
**Αλλαγή:** βάλτε συγκεκριμένο id στο `model:`.

### D009: Νέα κλειδιά στο `volume.yaml`
**2026-10-14.** Πέρα από τα κλειδιά της §7.5 προστέθηκαν: `briefs_per_night`, `max_pending_reviews` (δεν ξεκινά νέο κελί αν περιμένουν πολλά σε gates), `max_step_attempts`, `lead_batch_size`, `leads_retention_months`, `campaigns.min_qa_pass_rate`, `campaigns.max_qa_rounds`, `email.warmup_started_at`, `guards.*`.
**Γιατί:** Το σύστημα δεν πρέπει να παράγει πιο γρήγορα απ' όσο προλαβαίνουν να εγκρίνουν δύο άνθρωποι σε ~10 λεπτά τη μέρα, και χρειάζεται όρια για τις επαναλήψεις και την αυτόματη προστασία.
**Αλλαγή:** τιμές στο `config/volume.yaml`.

### D010: Κανάλια με ξεχωριστά ids
**2026-10-14.** Ids καναλιών: `inbound`, `phone_b2b`, `email_gr`, `email_intl`, `partners`, `social_dm`. Μόνο το `inbound` είναι `approved` από την αρχή (το ορίζει το brief). Ένα κανάλι είναι approved μόνο αν το λένε **και** το `config/channels.yaml` **και** το `compliance/LEGAL_STATUS.md` (με ημερομηνία και όνομα).
**Γιατί:** Δύο κλειδιά για την πιο επικίνδυνη απόφαση του συστήματος. Το `LEGAL_STATUS.md` το γράφει μόνο άνθρωπος.
**Αλλαγή:** στο `compliance/LEGAL_STATUS.md`.

### D011: Ο Builder δεν αλλάζει κοινά components
**2026-10-14.** Ο Builder γράφει μόνο στον φάκελο του demo του (`showcase/src/demos/<slug>/`), στο test του και στο `build.md`. Η λίστα των demos παράγεται από script. Αλλαγές σε κοινά components τις ζητά στο `build.md` και τις κάνει άνθρωπος ή ξεχωριστό PR.
**Γιατί:** Ένα demo τη νύχτα δεν πρέπει να μπορεί να σπάσει τα υπόλοιπα. Ελάχιστα δικαιώματα (§5.3).
**Αλλαγή:** στο `agents/builder.md` και στα write scopes του orchestrator.

### D012: Gates σε ξεχωριστό config
**2026-10-14.** Πρόσθεσα `config/gates.yaml` (approvers, labels, checklist ανά gate), που δεν υπάρχει στην §3.
**Γιατί:** Τα checklists των issues και η λίστα approvers πρέπει να αλλάζουν χωρίς αλλαγή κώδικα.
**Αλλαγή:** στο ίδιο αρχείο.

### D013: Το dry-run γράφει σε sandbox `.dry-run/`
**2026-10-14.** Με `--dry-run` το state (pipeline/, review/, reports/, αντίγραφο του matrix) γράφεται στο `.dry-run/`, που το αγνοεί το git. Config, agents και compliance διαβάζονται από το πραγματικό repo.
**Γιατί:** Τα fixtures δεν πρέπει ποτέ να μπουν στο πραγματικό `pipeline/` ή να αλλάξουν το `status` στο `matrix.yaml`.
**Αλλαγή:** `src/paths.ts` (`DRY_RUN_DIR`).

### D014: Ελάχιστα δικαιώματα επιβάλλονται από τον orchestrator (scope guard)
**2026-10-14.** Πέρα από τα `--allowedTools` του CLI, ο orchestrator κρατά στιγμιότυπο των αρχείων πριν από κάθε worker. Ό,τι αλλάξει εκτός του write scope αναιρείται και το βήμα αποτυγχάνει. Τα `task.yaml`, `review/`, `config/`, `compliance/`, `agents/`, `CLAUDE.md`, `.github/` επαναφέρονται πάντα, ακόμα κι αν κάποιο scope τα καλύπτει.
**Γιατί:** Το Codex και το Gemini δεν έχουν το ίδιο σύστημα δικαιωμάτων με το Claude Code. Ο κανόνας «κανένας agent δεν περνά gate» πρέπει να ισχύει ανεξάρτητα από τον worker.
**Αλλαγή:** `src/scope-guard.ts` (`PROTECTED_GLOBS`) και το `writeScope` κάθε βήματος.

### D015: Fallback μόνο για όρια χρήσης και για CLI που λείπει
**2026-10-14.** Ο fallback worker τρέχει μόνο αν ο primary είναι σε cooldown, χτύπησε όριο ή δεν είναι εγκατεστημένος. Σε κανονικό σφάλμα ή timeout το βήμα αποτυγχάνει καθαρά και ξαναδοκιμάζεται την επόμενη νύχτα (μέχρι `max_step_attempts`). Κάθε κελί αποτυγχάνει το πολύ μία φορά ανά νύχτα.
**Γιατί:** «Ποτέ loop επαναλήψεων» (§5.3). Ένα σφάλμα στο prompt ή στο output δεν διορθώνεται αλλάζοντας μοντέλο· θέλει άνθρωπο.
**Αλλαγή:** `src/workers/pool.ts`.

### D016: `changes` και στο Gate 1
**2026-10-14.** Στο Gate 1 επιτρέπεται και `changes` (→ `scouting` με feedback), όχι μόνο `approved` / `rejected`.
**Γιατί:** Συχνά η ιδέα είναι σωστή αλλά θέλει άλλη γωνία. Η απόρριψη και επανεκκίνηση χάνει το ιστορικό.
**Αλλαγή:** `GATE_OUTCOMES` στο `src/state/machine.ts`.

### D017: Lock σε αρχείο, πέρα από το concurrency group
**2026-10-14.** Κάθε εντολή που γράφει παίρνει lock (`.factory.lock`). Ένα lock παλαιότερο από 6 ώρες θεωρείται ορφανό.
**Γιατί:** Τα scheduled routines και οι τοπικές εκτελέσεις δεν έχουν concurrency group του GitHub Actions.
**Αλλαγή:** `src/lock.ts`.

### D018: Prompt από stdin, κανόνες από αρχεία
**2026-10-14.** Το prompt περνά στο CLI από stdin (όχι argv) και είναι κοντό: λέει στον agent ποια αρχεία να διαβάσει (`CLAUDE.md`, `config/brand.md`, `agents/<agent>.md`, feedback) και ποια να γράψει. Οι κανόνες δεν αντιγράφονται μέσα στο prompt.
**Γιατί:** Μία πηγή αλήθειας για όλους τους workers. Χωρίς όρια μήκους εντολής, και το prompt δεν φαίνεται στη λίστα διεργασιών.
**Αλλαγή:** `src/prompt.ts`.

### D019: Χωρίς approvers, κανείς δεν περνά gate στο GitHub
**2026-10-14.** Αν το `config/gates.yaml` → `approvers` έχει μόνο placeholders (`{{TODO}}`), ο adapter GitHub δεν δέχεται καμία απόφαση.
**Γιατί:** Ασφαλής προεπιλογή. Καλύτερα να περιμένει κάτι απ' ό,τι να περάσει από λάθος λογαριασμό.
**Αλλαγή:** συμπληρώστε τα GitHub logins.

### D020: Τα πρώτα 3 briefs και demos γράφτηκαν στη session εγκατάστασης
**2026-10-14.** Δεν υπάρχουν διαπιστευτήρια workers σε αυτό το περιβάλλον, οπότε τα briefs και τα demos των 3 πρώτων κελιών τα έγραψε η ίδια η session (με τον ρόλο Scout και Builder). Πέρασαν από τον orchestrator με `--worker prepared`: ίδιοι έλεγχοι μορφής και scope, ίδιες μεταβάσεις, και στο ιστορικό φαίνεται worker «prepared». Το state machine δεν παρακάμφθηκε: τα κελιά περιμένουν στο Gate 1 την έγκρισή σας. Ο κώδικας των demos υπάρχει ήδη στη showcase ως «Πρόχειρο» (noindex, εκτός hub).
**Γιατί:** Η Φάση 3 ζητά 3 δουλεμένα demos και να δοκιμαστεί η ροή. Χωρίς workers, αυτός ήταν ο τρόπος να γίνουν και τα δύο χωρίς να ψευτίσουμε ότι τα έφτιαξε νυχτερινός agent.
**Αλλαγή:** Μετά το Gate 1: `npm run factory -- cell <id> build --worker prepared` (τρέχει typecheck, lint, Playwright). Αν προτιμάτε να τα ξαναφτιάξει ο Builder από το μηδέν, σβήστε τον φάκελο του demo πριν από το βράδυ.

### D021: Πηγές του Scout από αναζήτηση, χωρίς άνοιγμα σελίδων
**2026-10-14.** Το δίκτυο της session επέτρεπε αναζήτηση στο web αλλά όχι άνοιγμα σελίδων. Τα briefs γράφουν ρητά ότι τα στοιχεία είναι από αποσπάσματα της αναζήτησης και ποιες πηγές πρέπει να ανοιχτούν πριν από δημοσίευση. Νούμερα από παρόχους λογισμικού σημειώνονται ως τέτοια.
**Γιατί:** Κανόνας ειλικρίνειας. Καλύτερα ένα σημειωμένο κενό παρά μια ψεύτικη βεβαιότητα.
**Αλλαγή:** Στα νυχτερινά runs ο Scout (Claude Code με WebFetch) ανοίγει τις σελίδες κανονικά.

### D022: Live AI μόνο με Anthropic, μοντέλο από env, όρια στη μνήμη
**2026-10-14.** Το `/api/live` χρησιμοποιεί το επίσημο Anthropic SDK και ενεργοποιείται μόνο αν υπάρχουν `ANTHROPIC_API_KEY` **και** `LIVE_AI_MODEL`. Δεν υλοποιήθηκε δρόμος για `OPENAI_API_KEY`. Rate limit ανά IP και όριο κόστους ανά ημέρα κρατιούνται στη μνήμη της διεργασίας.
**Γιατί:** Ένας provider = λιγότερος κώδικας να ελεγχθεί. Το μοντέλο στο env ώστε να αλλάζει χωρίς deploy. Στη μνήμη επειδή δεν υπάρχει ακόμα Supabase/KV· σε serverless το όριο είναι ανά instance, άρα λίγο πιο χαλαρό.
**Αλλαγή:** Όριο σε Supabase ή Vercel KV όταν υπάρξουν (`src/lib/live-guard.ts`).

### D023: Budget απόδοσης με Playwright αντί για Lighthouse
**2026-10-14.** Το `e2e/perf.spec.ts` μετρά LCP (< 1.5s) και JS πρώτης φόρτωσης (< 250 KB) σε τοπικό production server, στα 390px.
**Γιατί:** Το Lighthouse θέλει δικό του Chrome και δίκτυο και δίνει θορυβώδη νούμερα σε CI. Αυτό πιάνει παλινδρομήσεις στο βάρος της σελίδας χωρίς εξαρτήσεις. Χωρίς web fonts και εικόνες, για να μένει χαμηλό το LCP.
**Αλλαγή:** Lighthouse CI στο Vercel preview όταν συνδεθεί.

### D024: Δημοσίευση = `showcase/content/published.json`
**2026-10-14.** Κάθε demo στον κώδικα έχει σελίδα (για έλεγχο στο Gate 2), αλλά είναι `noindex`, σημαδεμένο «Πρόχειρο» και εκτός hub/sitemap μέχρι να μπει το slug στο `published.json`. Το αρχείο το γράφει ο orchestrator όταν περάσει το Gate 3.
**Γιατί:** Ένα deploy για όλα, χωρίς feature flags ανά demo, και κανένα demo στη Google πριν από ανθρώπινη έγκριση.
**Αλλαγή:** `src/lib/site.ts`.

### D025: Κάθε demo σε δικό του branch, PR μόνο αν το ζητήσεις
**2026-10-14.** Μετά τους ελέγχους, ο Builder ανεβάζει τα αρχεία του demo σε branch `demo/<slug>` πάνω στο `main` (προσωρινό git index, χωρίς να αλλάξει το working tree) και ανοίγει draft PR. Ενεργό μόνο με `FACTORY_PUBLISH_BRANCHES=1` (το βάζει το workflow). Ποτέ push στο `main`: ο κώδικας το αρνείται ρητά.
**Γιατί:** «Οι agents δουλεύουν μόνο σε branches». Ο orchestrator κρατά το state του σε άλλο branch, και κάθε demo φτάνει καθαρό στο PR, με preview από το Vercel.
**Αλλαγή:** `src/git.ts`, `FACTORY_BASE_BRANCH` για άλλο base.
