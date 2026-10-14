# Build: Ιατρεία και οδοντιατρεία × Support Agent

> Γράφτηκε στη session εγκατάστασης (Φάση 3), όχι από νυχτερινό worker. Ο κώδικας είναι έτοιμος, αλλά το κελί περιμένει πρώτα το Gate 1 (ιδέα). Όταν εγκριθεί: `npm run factory -- cell iatreia-support build --worker prepared` τρέχει τους ελέγχους της showcase και το περνά στο Gate 2.

## Τι φτιάχτηκε
- Component: **ChatSimulator (Viber)**, μόνο config στο `showcase/src/demos/iatreia-support/demo.ts`. Κανένα νέο component.
- Ροή: ωράριο (με ένδειξη πηγής) → ΕΟΠΥΥ → διαθέσιμα ραντεβού → αίτημα ραντεβού για επιβεβαίωση από τη γραμματεία → «πόνος στο στήθος»: χωρίς ιατρική συμβουλή, 166/112, προώθηση σε άνθρωπο με σημαία «επείγον». Live AI προαιρετικά.
- Badge «Demo: ενδεικτικά δεδομένα», CTA «Κλείσε τον Χάρτη AI», ΠΡΙΝ → ΜΕΤΑ, KPI pilot, share: από το κοινό DemoShell.
- Η επιχείρηση είναι φανταστική και το λέει η σελίδα. Τιμές και ώρες σημειώνονται ως ενδεικτικές.

## Πώς το βλέπεις
`cd showcase && npm ci && npm run dev` → http://localhost:3000/demos/iatreia-support (με `?fast=1` τρέχει ~10x πιο γρήγορα).
Preview URL: θα το βάλει το Vercel στο PR όταν συνδεθεί το project.

## Έλεγχοι
- `npm run typecheck`: ok
- `npm run lint`: ok
- `npm run build`: ok (στατική σελίδα, noindex μέχρι το Gate 3)
- `npx playwright test e2e/demos/iatreia-support.spec.ts` (390×844, σε πραγματική ταχύτητα, όριο 60″): ok. Καλύπτει: πλήρης διαδρομή και σύντομη διαδρομή (κατευθείαν στο επείγον).
- Budget απόδοσης (`e2e/perf.spec.ts`): LCP < 1.5s και JS < 250 KB σε τοπικό production server: ok.

## Αιτήματα για κοινά components
Κανένα

## Γνωστά κενά
- Δεν έχει δοκιμαστεί σε πραγματικό κινητό και μέσα στον browser του Instagram, μόνο σε προσομοίωση Chromium 390px.
- Το live AI δεν δοκιμάστηκε με πραγματικό κλειδί (χωρίς κλειδί κρύβεται, αυτό ελέγχθηκε).
