import type { AutomationDemoConfig, DashboardDemoConfig } from '@/lib/demo-types';

/**
 * Παραδείγματα για τα components που δεν χρησιμοποιεί ακόμα κανένα demo (DashboardDemo,
 * AutomationFlow). Φαίνονται μόνο στη σελίδα /components (για ανάπτυξη και tests).
 */
const common = {
  businessName: 'Επιχείρηση Παράδειγμα',
  duration: '~20″',
  beforeAfter: { before: ['Παράδειγμα πριν.'], after: ['Παράδειγμα μετά.'] },
  pilotKpi: 'παράδειγμα KPI',
};

export const exampleDashboard: DashboardDemoConfig = {
  ...common,
  kind: 'dashboard',
  slug: 'example-dashboard',
  vertical: 'eshops',
  service: 'analyst_agent',
  title: 'Παράδειγμα: Analyst Agent',
  tagline: 'Ερώτηση σε απλά ελληνικά, απάντηση από τα δεδομένα σου.',
  instruction: 'Πάτα μια ερώτηση.',
  dataNote: 'Ενδεικτικά δεδομένα ενός φανταστικού e-shop.',
  questions: [
    {
      label: 'Ποια προϊόντα πούλησαν περισσότερο τον Σεπτέμβριο;',
      answer: 'Τα τρία πρώτα σε τεμάχια ήταν τα παρακάτω (ενδεικτικά δεδομένα).',
      chart: [
        { label: 'Προϊόν Α', value: 120 },
        { label: 'Προϊόν Β', value: 90 },
        { label: 'Προϊόν Γ', value: 45 },
      ],
      unit: ' τεμ.',
      suggestion: 'Το Προϊόν Γ έχει απόθεμα για λίγες μέρες ακόμα. Θες υπενθύμιση για παραγγελία;',
    },
  ],
};

export const exampleAutomation: AutomationDemoConfig = {
  ...common,
  kind: 'automation',
  slug: 'example-automation',
  vertical: 'logistika',
  service: 'automation',
  title: 'Παράδειγμα: Αυτοματισμός',
  tagline: 'Τα βήματα ανάμεσα στα εργαλεία γίνονται μόνα τους.',
  instruction: 'Πάτα «Τρέξε».',
  trigger: 'έρχεται email από πελάτη με συνημμένο τιμολόγιο',
  steps: [
    { tool: 'Gmail', action: 'Βρίσκει το συνημμένο', detail: 'PDF τιμολογίου' },
    { tool: 'Drive', action: 'Το αρχειοθετεί', detail: 'στον φάκελο του πελάτη, ανά μήνα' },
    { tool: 'Sheets', action: 'Το καταγράφει', detail: 'ημερομηνία, ποσό, ΑΦΜ εκδότη' },
  ],
  result: { kind: 'info', title: 'Έτοιμο', lines: ['Το τιμολόγιο αρχειοθετήθηκε και καταγράφηκε.'] },
};

export const EXAMPLES = [exampleDashboard, exampleAutomation];
