# Build: Κομμωτήρια και κουρεία × Σύστημα κρατήσεων

> Γράφτηκε στη session εγκατάστασης (Φάση 3), όχι από νυχτερινό worker. Ο κώδικας είναι έτοιμος, αλλά το κελί περιμένει πρώτα το Gate 1 (ιδέα). Όταν εγκριθεί: `npm run factory -- cell kommotiria-booking build --worker prepared` τρέχει τους ελέγχους της showcase και το περνά στο Gate 2.

## Τι φτιάχτηκε
- Component: **BookingFlow**, μόνο config στο `showcase/src/demos/kommotiria-booking/demo.ts`. Κανένα νέο component.
- Ροή: υπηρεσία → κομμωτής → ελεύθερη ώρα → επιβεβαίωση → υπενθύμιση στο Viber με «Θα έρθω» / «Θέλω αλλαγή» → η ώρα πάει στη λίστα αναμονής. Panel «Τι βλέπεις εσύ» με το πρόγραμμα του κομμωτηρίου.
- Badge «Demo: ενδεικτικά δεδομένα», CTA «Κλείσε τον Χάρτη AI», ΠΡΙΝ → ΜΕΤΑ, KPI pilot, share: από το κοινό DemoShell.
- Η επιχείρηση είναι φανταστική και το λέει η σελίδα. Τιμές και ώρες σημειώνονται ως ενδεικτικές.

## Πώς το βλέπεις
`cd showcase && npm ci && npm run dev` → http://localhost:3000/demos/kommotiria-booking (με `?fast=1` τρέχει ~10x πιο γρήγορα).
Preview URL: θα το βάλει το Vercel στο PR όταν συνδεθεί το project.

## Έλεγχοι
- `npm run typecheck`: ok
- `npm run lint`: ok
- `npm run build`: ok (στατική σελίδα, noindex μέχρι το Gate 3)
- `npx playwright test e2e/demos/kommotiria-booking.spec.ts` (390×844, σε πραγματική ταχύτητα, όριο 60″): ok. Καλύπτει: κράτηση, υπενθύμιση, αλλαγή, CTA.
- Budget απόδοσης (`e2e/perf.spec.ts`): LCP < 1.5s και JS < 250 KB σε τοπικό production server: ok.

## Αιτήματα για κοινά components
Κανένα

## Γνωστά κενά
- Δεν έχει δοκιμαστεί σε πραγματικό κινητό και μέσα στον browser του Instagram, μόνο σε προσομοίωση Chromium 390px.
- Το live AI δεν δοκιμάστηκε με πραγματικό κλειδί (χωρίς κλειδί κρύβεται, αυτό ελέγχθηκε).
