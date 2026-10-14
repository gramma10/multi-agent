# Auragram Showcase Factory

Κάθε βράδυ οι agents παίρνουν το επόμενο κελί από τον πίνακα **κλάδος × υπηρεσία**, βρίσκουν τι πονάει τον κλάδο, φτιάχνουν ένα δουλεμένο demo, γράφουν το περιεχόμενο γύρω του και ετοιμάζουν καμπάνια outreach. Το πρωί εσείς εγκρίνετε σε 4 σημεία από το κινητό. Τίποτα δεν βγαίνει προς τα έξω χωρίς εσάς.

```
Scout → [Gate 1: ιδέα] → Builder → [Gate 2: demo] → Content → [Gate 3: δημοσίευση]
      → Leads → Outreach → QA → [Gate 4: καμπάνια] → export → (στέλνετε εσείς) → Tracker
                                                                                   ↓
                                             ο tracker αλλάζει τις προτεραιότητες στον πίνακα
```

Το πλήρες brief είναι στο [`CLOUD_SESSION_PROMPT.md`](CLOUD_SESSION_PROMPT.md) και το διάγραμμα στο [`auragram-system.drawio`](auragram-system.drawio) (ανοίγει στο [app.diagrams.net](https://app.diagrams.net)). Η πρόοδος ανά φάση είναι στο [`PROGRESS.md`](PROGRESS.md) και οι αποφάσεις στο [`DECISIONS.md`](DECISIONS.md).

## Πού είναι τι

| Φάκελος | Τι έχει |
|---|---|
| `CLAUDE.md` | κανόνες για κάθε agent (τους διαβάζουν όλοι πρώτα) |
| `config/` | brand, πίνακας κελιών, όρια όγκου, κανάλια, workers, gates |
| `agents/` | ένα spec ανά agent: ρόλος, input, output, κανόνες |
| `orchestrator/` | ο κώδικας που τα τρέχει όλα (TypeScript) |
| `showcase/` | η Next.js app με το hub, όλα τα demos και τις SEO σελίδες |
| `pipeline/<κελί>/` | ό,τι παράγεται για κάθε κελί: `task.yaml`, `brief.md`, `content/`, `campaign/` |
| `review/REVIEW.md` | **ό,τι περιμένει εσάς**, ξαναγράφεται σε κάθε εκτέλεση |
| `reports/` | εβδομαδιαίες αναφορές και καταγραφή χρήσης των workers |
| `compliance/` | νομικό status καναλιών, deliverability, suppression |
| `supabase/migrations/` | το schema της βάσης για leads, καμπάνιες, events |

Δεδομένα leads (στοιχεία επιχειρήσεων και επαφών) **δεν μπαίνουν ποτέ στο git**. Ζουν μόνο στη βάση. Ένα pre-commit check το επιβάλλει: τρέξε μία φορά `npm run setup-hooks`.

## Πώς τρέχει

Απαιτεί Node 22.

```bash
cd orchestrator && npm install && cd ..

npm run factory -- status                  # πίνακας κελιών και states
npm run factory -- next --dry-run          # ένα βήμα για το επόμενο κελί
npm run factory -- run-night --dry-run     # πλήρης βραδινός κύκλος
npm run factory -- run-morning             # διαβάζει εγκρίσεις, ξαναγράφει το REVIEW.md, ανοίγει issues
npm run factory -- sync-approvals          # διαβάζει μόνο τα labels στα issues
npm run factory -- cell <id> <step>        # χειροκίνητη εκτέλεση ενός βήματος
npm run factory -- export <campaign-id>    # batch για το εργαλείο αποστολής (μόνο αν έχει εγκριθεί)

# Leads (στη βάση, ποτέ στο git)
npm run factory -- leads <id> --city Αθήνα --limit 50   # δοκιμή πηγών για 1 πόλη
npm run factory -- suppress email info@x.gr --reason "ζήτησε διαγραφή"
npm run factory -- gdpr-erase info@x.gr                 # άρθρο 17: σβήνει παντού, κρατά μόνο hash
npm run factory -- gdpr-export info@x.gr                # άρθρο 15: ό,τι έχουμε, σε exports/gdpr/
npm run factory -- retention                            # ανωνυμοποίηση παλιών leads

# Αποτελέσματα (tracker)
npm run factory -- track-import events.csv --source instantly   # ή smartlead | lemlist | calcom
npm run factory -- track-calcom                         # κρατήσεις Χάρτη AI από το Cal.com API
npm run factory -- record pilot <κελί> --by Χρήστος     # ένα pilot που ξεκίνησε
npm run factory -- weekly                               # reports/YYYY-WW.md + αλλαγές priority
npm run factory -- unfreeze <campaign-id> --by Χρήστος  # ξεπάγωμα καμπάνιας (μόνο άνθρωπος)
```

Με `--dry-run` δεν χρειάζεται κανένα κλειδί: οι agents τρέχουν με fixtures, οι εγκρίσεις γράφονται στο `review/REVIEW.md` αντί για GitHub Issues, και όλα τα αρχεία πηγαίνουν σε ξεχωριστό φάκελο `.dry-run/` που δεν μπαίνει στο git.

**Κουμπί κινδύνου:** αν υπάρχει αρχείο `PAUSE` στη ρίζα του repo ή το repo variable `FACTORY_PAUSED=true`, ο orchestrator δεν κάνει τίποτα.

```bash
touch PAUSE && git add PAUSE && git commit -m "pause factory" && git push   # σταματά όλα
git rm PAUSE && git commit -m "resume factory" && git push                  # ξαναρχίζει
```

## Πώς εγκρίνετε (GitHub Issues, δουλεύει από κινητό)

Όταν ένα κελί φτάνει σε gate, ανοίγει issue με τίτλο τύπου `[GATE 2] Demo: Ιατρεία × Support Agent`. Μέσα έχει σύνοψη, links και checklist για το τι να ελέγξετε.

Βάζετε **ένα** label:

| Label | Τι γίνεται |
|---|---|
| `approved` | το κελί προχωρά στο επόμενο βήμα το ίδιο βράδυ |
| `changes` | γράψτε σχόλιο με το τι αλλάζει· ο agent το παίρνει ως feedback και ξαναδουλεύει |
| `rejected` | το κελί πάει στο αρχείο (γράψτε σχόλιο με τον λόγο, βοηθά τον scout) |

Μετράνε μόνο labels από τους λογαριασμούς στο `config/gates.yaml` → `approvers`. Κανένας agent δεν μπορεί να περάσει gate.

Ό,τι περιμένει, από πότε και με links, είναι πάντα συγκεντρωμένο στο [`review/REVIEW.md`](review/REVIEW.md).

## Πώς προσθέτεις κλάδο

Μία γραμμή στο `config/matrix.yaml`, κάτω από `verticals:`

```yaml
  - { id: kthniatreia, name: "Κτηνιατρεία", kad: ["75.00"], places: ["κτηνίατρος"] }
```

Τα 6 κελιά του (ένα ανά υπηρεσία) δημιουργούνται αυτόματα με `fit: medium` και `priority: 40`. Αν θέλεις να ορίσεις fit και priority ανά υπηρεσία, γράψε τα κελιά του κάτω από `cells:` όπως τα υπόλοιπα.

Για να αλλάξεις τη σειρά: άλλαξε το `priority` (0–100) ενός κελιού. Ο orchestrator παίρνει πρώτα όσα έχουν `fit: high`, μετά κατά `priority`.

## Πού τρέχει (χρονοπρογραμματισμός)

GitHub Actions στο `.github/workflows/`:

| Workflow | Πότε | Τι κάνει |
|---|---|---|
| `factory-night.yml` | κάθε βράδυ 02:00 (ώρα Ελλάδας, καλοκαίρι) | προχωρά ό,τι μπορεί μέσα στα όρια του `config/volume.yaml` |
| `factory-morning.yml` | κάθε πρωί 08:00 | διαβάζει εγκρίσεις, ανοίγει issues για νέα gates, ξαναγράφει το `REVIEW.md` |
| `factory-weekly.yml` | Δευτέρα 09:00 | κρατήσεις Cal.com, εβδομαδιαία αναφορά, αλλαγές priority, retention |
| `ci.yml` | κάθε push και PR | lint, typecheck, tests, Playwright στα 390px, έλεγχος προσωπικών δεδομένων, όλη η ροή σε dry-run |

- **Το state πάει στο branch `factory/state`, ποτέ στο `main`.** Κάθε run ξεκινά από αυτό, παίρνει πρώτα τις αλλαγές σας από το `main` (config, merged PRs) και στο τέλος κάνει commit και push. Υπάρχει ένα ανοιχτό draft PR `factory/state → main`: όταν το κάνετε merge, βγαίνουν στο site όσα έχουν περάσει τα gates (το Vercel κάνει deploy από το `main`).
- **Ένας orchestrator τη φορά:** τα τρία factory workflows μοιράζονται το `concurrency` group `factory-state`, χωρίς ακύρωση του run που τρέχει.
- **Χειροκίνητη εκτέλεση:** Actions → workflow → Run workflow. Η προεπιλογή είναι **dry-run** (fixtures, τίποτα δεν γράφεται). Για πραγματικό run, ξετσεκάρετε το dry-run.
- **Workers:** εγκαθίστανται μόνο όσοι έχουν secret. Αν λείπει το Codex ή το Gemini, ο orchestrator το βλέπει ως «δεν υπάρχει» και πάει στον fallback.
- **Repo variables** (Settings → Secrets and variables → Actions → Variables): `FACTORY_PAUSED=true` σταματά τα πάντα· `FACTORY_PUBLISH_BRANCHES=1` ανεβάζει κάθε demo και σε δικό του branch `demo/<κελί>` με PR (για Vercel preview πριν το Gate 2).
- Δοκιμή της ροής τοπικά, όπως στο CI: `bash scripts/ci/dry-run-e2e.sh`.

### Εναλλακτική: Claude Code scheduled routines

Αν δεν θέλετε GitHub Actions, το ίδιο γίνεται με τα scheduled routines του Claude Code, που τρέχουν στο cloud με τη συνδρομή σας:

```
/schedule "κάθε μέρα στις 02:00: bash scripts/ci/prepare-state.sh && npm --prefix orchestrator ci && npm run factory -- run-night && bash scripts/ci/commit-state.sh 'factory: βραδινός κύκλος'"
/schedule "κάθε μέρα στις 08:00: bash scripts/ci/prepare-state.sh && npm --prefix orchestrator ci && npm run factory -- run-morning && bash scripts/ci/commit-state.sh 'factory: πρωινός κύκλος'"
/schedule "κάθε Δευτέρα στις 09:00: bash scripts/ci/prepare-state.sh && npm --prefix orchestrator ci && npm run factory -- weekly && bash scripts/ci/commit-state.sh 'factory: εβδομαδιαία αναφορά'"
```

Τα ίδια scripts με το Actions: state στο `factory/state`, ποτέ στο `main`. Τα secrets (`SUPABASE_DB_URL` κ.λπ.) μπαίνουν στις μεταβλητές περιβάλλοντος του routine, όχι στο repo. Για εγκρίσεις με GitHub Issues χρειάζονται `GITHUB_REPOSITORY=owner/repo` και `gh` με δικαιώματα· αλλιώς οι εγκρίσεις γίνονται από το `review/REVIEW.md`: `npm run factory -- decide <κελί> approved --by <όνομα>` πάνω στο branch `factory/state`, commit και push.

Τα routines δεν έχουν `concurrency` group, οπότε ο orchestrator κρατά και δικό του lock (`.factory.lock`) για να μην τρέξει δεύτερος ταυτόχρονα.

## Τι πρέπει να κάνουν οι ιδρυτές

Αυτά δεν μπορεί να τα κάνει κανένας agent:

- [ ] **GitHub secrets** (Settings → Secrets and variables → Actions):

  | Secret | Από πού | Χωρίς αυτό |
  |---|---|---|
  | `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` (συνδρομή) | κανένας agent δεν τρέχει (μόνο fallbacks) |
  | `OPENAI_API_KEY` | προαιρετικό, για Codex | ο outreach πάει στο Claude |
  | `GEMINI_API_KEY` | προαιρετικό, για Gemini CLI | χωρίς fallback σε όρια χρήσης του Claude |
  | `SUPABASE_DB_URL` | Supabase → Project Settings → Database → connection string | δεν τρέχουν leads, καμπάνιες, tracker στο Actions (D029: αντί για `SUPABASE_URL` + service key, ο orchestrator μιλά απευθείας στο Postgres) |
  | `GOOGLE_PLACES_API_KEY` | Google Cloud, Places API (New) | leads μόνο από ΓΕΜΗ |
  | `GEMI_API_KEY` | opendata του ΓΕΜΗ (δωρεάν) | leads μόνο από Places |
  | `CAL_API_KEY` | Cal.com → Settings → Developer → API keys | κρατήσεις μόνο από CSV export |

- [ ] **GitHub settings:** Settings → Actions → General → Workflow permissions: «Read and write» και «Allow GitHub Actions to create and approve pull requests» (για το PR του `factory/state`). Προτείνεται branch protection στο `main` (merge μόνο με PR και πράσινο CI).
- [ ] **GitHub logins** των δύο ιδρυτών στο `config/gates.yaml` → `approvers`.
- [ ] **Vercel project** για το `showcase/` (Root Directory: `showcase`) και domain, π.χ. `demos.auragram.gr`.
- [ ] **Supabase project** και εκτέλεση των migrations στο `supabase/migrations/`.
- [ ] **Cal.com link** για τον «Χάρτη AI» και στοιχεία αποστολέα στο `config/channels.yaml` → `sender`.
- [ ] **Γνώμη δικηγόρου** για cold email στην Ελλάδα (άρθρο 11 ν.3471/2006, GDPR) και για τις διεθνείς αγορές, με συμπλήρωση του `compliance/LEGAL_STATUS.md`. Οι ερωτήσεις είναι ήδη γραμμένες εκεί.
- [ ] Αν εγκριθεί το email: sending domains, inboxes, warmup, εργαλείο αποστολής (βλ. `compliance/DELIVERABILITY.md`), `config/sending-domains.yaml` (από το `.example`), και μετά `email.inboxes` και `email.warmup_started_at` στο `config/volume.yaml`.
- [ ] Αν εγκριθούν οι κλήσεις: φόρτωση του μητρώου αντιρρήσεων κάθε μήνα (`npm run factory -- import-objection-registry <αρχείο>`).
- [ ] **Exports:** τα κάνετε εσείς, τοπικά: `npm run factory -- export <campaign-id> --tool instantly|smartlead|lemlist`. Το αρχείο γράφεται στο `exports/` (εκτός git) και το ανεβάζετε στο εργαλείο αποστολής. Ο orchestrator δεν στέλνει ποτέ τίποτα.
- [ ] **Μετά από κάθε αποστολή:** export των events από το εργαλείο αποστολής (CSV) και `track-import`. Οι διαγραφές μπαίνουν αμέσως στη suppression μόνο όταν γίνει η εισαγωγή, οπότε τουλάχιστον μία φορά τη μέρα όσο τρέχει καμπάνια. Για το Cal.com: `CAL_API_KEY` στα secrets (ή export CSV).
- [ ] **Pilots:** `npm run factory -- record pilot <κελί> --by <όνομα>` όταν ξεκινά ένα.
- [ ] **Καθημερινά, ~10 λεπτά:** εγκρίσεις στα GitHub Issues με labels.
