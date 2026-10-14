# showcase/

Μία Next.js app (16.x, App Router) για όλα τα demos. Ένα deploy στο Vercel τα καλύπτει όλα.

> Η έκδοση του Next έχει breaking changes (async `params`, `proxy` αντί για `middleware`, flat ESLint config). Διάβασε τα docs στο `node_modules/next/dist/docs/` πριν γράψεις κώδικα Next.

```bash
npm ci
npm run dev                 # http://localhost:3000
npm run typecheck && npm run lint
npx playwright test         # build + όλα τα tests σε κινητό 390×844
```

## Σελίδες

| Route | Τι είναι |
|---|---|
| `/` | hub: όλα τα **δημοσιευμένα** demos, φίλτρα ανά κλάδο και υπηρεσία, CTA «Κλείσε τον Χάρτη AI» |
| `/demos/<slug>` | το demo. Υπάρχει για κάθε demo στον κώδικα (για έλεγχο στο Gate 2), αλλά είναι `noindex` και σημαδεμένο «Πρόχειρο» μέχρι το Gate 3 |
| `/lyseis/<klados>` | SEO σελίδα κλάδου (Φάση 4) |
| `/api/live` | live AI, κλειστό αν δεν υπάρχουν `ANTHROPIC_API_KEY` και `LIVE_AI_MODEL` |
| `/components` | κατάλογος κοινών components με παραδείγματα, μόνο με `SHOWCASE_SHOW_DRAFTS=1` |

Ποια demos είναι δημοσιευμένα το λέει το `content/published.json`, που το γράφει ο orchestrator όταν περάσει το Gate 3. Με `SHOWCASE_SHOW_DRAFTS=1` το hub δείχνει και τα πρόχειρα (για preview και tests).

## Πώς φτιάχνεις demo (για τον Builder)

Ένα demo = **ένα αρχείο config**: `src/demos/<slug>/demo.ts` που κάνει `export const demo: DemoConfig`. Τη λίστα των demos (`src/demos/registry.generated.ts`) την παράγει το `npm run gen:registry` αυτόματα πριν από dev, build και typecheck. Οι τύποι είναι στο `src/lib/demo-types.ts`.

| `kind` | Component | Για |
|---|---|---|
| `chat` | `ChatSimulator` | Sales / Support agent: συνομιλία Viber, WhatsApp, Messenger, Instagram, webchat. Σενάριο με κόμβους και έτοιμες απαντήσεις, panel «Τι βλέπεις εσύ» για την επιχείρηση |
| `booking` | `BookingFlow` | κρατήσεις: υπηρεσία → άτομο → ώρα → επιβεβαίωση → υπενθύμιση |
| `dashboard` | `DashboardDemo` | Analyst agent: ερώτηση σε απλά ελληνικά → απάντηση, γράφημα, πρόταση |
| `automation` | `AutomationFlow` | αυτοματισμός: βήματα ανάμεσα σε εργαλεία που «τρέχουν» ένα-ένα |

Όλα μπαίνουν μέσα στο `DemoShell`, που βάζει πάντα: badge «Demo: ενδεικτικά δεδομένα», οδηγία, ΠΡΙΝ → ΜΕΤΑ, KPI του pilot, CTA «Κλείσε τον Χάρτη AI», κουμπί share και τη σημείωση ότι η επιχείρηση είναι φανταστική.

Παραδείγματα: `src/demos/iatreia-support/demo.ts` (chat), `src/demos/kommotiria-booking/demo.ts` (booking), `src/components/demo/examples.ts` (dashboard, automation).

Test για κάθε demo: `e2e/demos/<slug>.spec.ts`, με τα helpers `openDemo` και `expectCompleted` από το `e2e/helpers.ts`. Τρέχει σε πραγματική ταχύτητα και ελέγχει ότι τελειώνει σε λιγότερο από 60″.

`?fast=1` στο URL: όλες οι καθυστερήσεις ~10x πιο γρήγορα.

## Environment (Vercel)

| Μεταβλητή | Τι κάνει |
|---|---|
| `NEXT_PUBLIC_BOOKING_URL` | link του Cal.com για τον Χάρτη AI (χωρίς αυτό το CTA πάει στην ενότητα `#xartis-ai`) |
| `NEXT_PUBLIC_SITE_URL` | π.χ. `https://demos.auragram.gr` (canonical, sitemap) |
| `SHOWCASE_SHOW_DRAFTS` | `1` μόνο σε preview deployments |
| `ANTHROPIC_API_KEY`, `LIVE_AI_MODEL` | ενεργοποιούν το live AI (και τα δύο χρειάζονται) |
| `LIVE_DAILY_BUDGET_USD` | όριο κόστους ανά ημέρα (προεπιλογή 1) |
| `LIVE_PER_IP_MAX`, `LIVE_PER_IP_WINDOW_MIN` | rate limit ανά IP (προεπιλογή 8 ανά 10 λεπτά) |
| `LIVE_PRICE_IN_PER_MTOK`, `LIVE_PRICE_OUT_PER_MTOK` | τιμές του μοντέλου για τον υπολογισμό κόστους |
