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
