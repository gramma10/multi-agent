# Πρόοδος

Μία ενότητα ανά φάση της §9 του brief. Η πιο πρόσφατη στην κορυφή.

| Φάση | Status |
|---|---|
| 1. Σκελετός και κανόνες | ✅ |
| 2. Orchestrator | ⏳ |
| 3. Showcase app + 3 demos | — |
| 4. Content pipeline | — |
| 5. Leads σε όγκο | — |
| 6. Campaigns + QA + export | — |
| 7. Tracker και βρόχος μάθησης | — |
| 8. Χρονοπρογραμματισμός και παράδοση | — |

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
