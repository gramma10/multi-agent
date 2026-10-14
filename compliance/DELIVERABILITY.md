# Deliverability: checklist πριν από οποιοδήποτε email σε όγκο

> Ισχύει μόνο αν το κανάλι `email_gr` ή `email_intl` γίνει `approved` στο `LEGAL_STATUS.md`. Μέχρι τότε το `email.inboxes` στο `config/volume.yaml` μένει `0` και δεν παράγεται export.
>
> Τα σημεία με 🔒 ελέγχονται και από κώδικα πριν από κάθε export (`orchestrator/src/compliance/`).

## 1. Domains

- [ ] 🔒 **Ποτέ** αποστολή από το κύριο domain της Auragram ή από gmail/outlook. Αν το κύριο domain «καεί», χάνεται και το email της εταιρείας.
- [ ] 2–3 ξεχωριστά **sending domains**, παραλλαγές του ονόματος (π.χ. `getauragram.gr`, `auragram-ai.com`), που κάνουν redirect στο κύριο site.
- [ ] Τα sending domains γράφονται στο `config/sending-domains.yaml` (δημιουργείται όταν στηθούν).

## 2. DNS σε κάθε sending domain

- [ ] 🔒 **SPF:** TXT record `v=spf1 include:<πάροχος> -all` (ή `~all` στην αρχή).
- [ ] 🔒 **DKIM:** το record που δίνει ο πάροχος, στο selector που δίνει ο πάροχος.
- [ ] 🔒 **DMARC:** TXT στο `_dmarc.<domain>`, ξεκινώντας με `v=DMARC1; p=none; rua=mailto:…` και μετά από 2–4 εβδομάδες `p=quarantine`.
- [ ] MX records, ώστε να φτάνουν οι απαντήσεις.
- [ ] Custom tracking domain (CNAME) αν το εργαλείο αποστολής κάνει tracking. Καλύτερα: **χωρίς open tracking** (pixel) στο πρώτο άγγιγμα.

## 3. Inboxes και warmup

- [ ] 2–3 inboxes ανά domain, με πραγματικά ονόματα (Χρήστος, Παναγιώτης) και φωτογραφία.
- [ ] **Warmup 2–4 εβδομάδες** ανά inbox πριν από το πρώτο cold email.
- [ ] 🔒 Ο συνολικός όγκος ανεβαίνει με **περισσότερα inboxes**, όχι με περισσότερα μηνύματα ανά inbox. Όριο: `inboxes × per_inbox_daily_limit` (30–50 την ημέρα ανά inbox), με ramp-up `ramp_up_weeks`.
- [ ] Συμπλήρωση `email.inboxes` και `email.warmup_started_at` στο `config/volume.yaml` μόνο όταν τελειώσει το warmup.

## 4. Μηνύματα

- [ ] 🔒 **List-Unsubscribe** header με one-click (RFC 8058, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`). Απαίτηση Gmail/Yahoo για αποστολείς σε όγκο. Το ρυθμίζει το εργαλείο αποστολής· ο orchestrator ελέγχει ότι το export έχει τη στήλη.
- [ ] 🔒 Plain text, το πολύ 2 links, χωρίς συνημμένα, χωρίς εικόνες.
- [ ] 🔒 Στοιχεία αποστολέα και απλός τρόπος διαγραφής σε κάθε μήνυμα.
- [ ] Spam complaint rate κάτω από 0.1% (Google Postmaster Tools). 🔒 Πάνω από 0.1% η καμπάνια παγώνει αυτόματα.
- [ ] 🔒 Bounce rate κάτω από 3%. Πάνω από 3% η καμπάνια παγώνει αυτόματα.

## 5. Παρακολούθηση

- [ ] Google Postmaster Tools για κάθε sending domain.
- [ ] Έλεγχος blacklists (π.χ. MXToolbox) μία φορά την εβδομάδα.
- [ ] Απαντήσεις «διαγράψτε με» → suppression **την ίδια μέρα** (το κάνει ο tracker).
