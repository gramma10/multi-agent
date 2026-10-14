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

Δεδομένα leads (στοιχεία επιχειρήσεων και επαφών) **δεν μπαίνουν ποτέ στο git**. Ζουν μόνο στη βάση.

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

- **Βραδινός κύκλος** (`factory-night.yml`): κάθε βράδυ, προχωρά ό,τι μπορεί μέσα στα όρια του `config/volume.yaml`.
- **Πρωινός κύκλος** (`factory-morning.yml`): διαβάζει εγκρίσεις, ξαναγράφει το `REVIEW.md`, ανοίγει issues.
- Κάθε workflow έχει `concurrency` group, ώστε να μην τρέχουν ποτέ δύο orchestrators ταυτόχρονα.

### Εναλλακτική: Claude Code scheduled routines

Αν δεν θέλετε GitHub Actions, το ίδιο γίνεται με τα scheduled routines του Claude Code, που τρέχουν στο cloud με τη συνδρομή σας:

```
/schedule "κάθε μέρα στις 02:00: cd στο repo, npm run factory -- run-night, commit και push στο branch factory/state"
/schedule "κάθε μέρα στις 07:30: npm run factory -- run-morning"
```

Τα routines δεν έχουν `concurrency` group, οπότε ο orchestrator κρατά και δικό του lock (`.factory.lock`) για να μην τρέξει δεύτερος ταυτόχρονα.

## Τι πρέπει να κάνουν οι ιδρυτές

Αυτά δεν μπορεί να τα κάνει κανένας agent:

- [ ] **GitHub secrets:** `CLAUDE_CODE_OAUTH_TOKEN` (από `claude setup-token`), προαιρετικά `OPENAI_API_KEY` (Codex) και `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_PLACES_API_KEY`, κλειδί ΓΕΜΗ (`GEMI_API_KEY`).
- [ ] **GitHub logins** των δύο ιδρυτών στο `config/gates.yaml` → `approvers`.
- [ ] **Vercel project** για το `showcase/` (Root Directory: `showcase`) και domain, π.χ. `demos.auragram.gr`.
- [ ] **Supabase project** και εκτέλεση των migrations στο `supabase/migrations/`.
- [ ] **Cal.com link** για τον «Χάρτη AI» και στοιχεία αποστολέα στο `config/channels.yaml` → `sender`.
- [ ] **Γνώμη δικηγόρου** για cold email στην Ελλάδα (άρθρο 11 ν.3471/2006, GDPR) και για τις διεθνείς αγορές, με συμπλήρωση του `compliance/LEGAL_STATUS.md`. Οι ερωτήσεις είναι ήδη γραμμένες εκεί.
- [ ] Αν εγκριθεί το email: sending domains, inboxes, warmup, εργαλείο αποστολής (βλ. `compliance/DELIVERABILITY.md`), και μετά `email.inboxes` στο `config/volume.yaml`.
- [ ] **Καθημερινά, ~10 λεπτά:** εγκρίσεις στα GitHub Issues με labels.
