/**
 * Ένα demo είναι κυρίως config: ποιο κοινό component, με ποιο σενάριο και ποια mock δεδομένα.
 * Ο Builder agent γράφει ΜΟΝΟ ένα `src/demos/<slug>/demo.ts` που κάνει `export const demo: DemoConfig`.
 */

export type Channel = 'viber' | 'whatsapp' | 'messenger' | 'instagram' | 'webchat' | 'email';

interface DemoBase {
  /** = id του κελιού στο config/matrix.yaml */
  slug: string;
  /** id κλάδου (π.χ. `iatreia`) */
  vertical: string;
  /** id υπηρεσίας (π.χ. `support_agent`) */
  service: string;
  /** Τίτλος του demo, σε β' ενικό, χωρίς υπόσχεση αποτελέσματος. */
  title: string;
  /** Μία πρόταση: ο πόνος που λύνει. */
  tagline: string;
  /** Το φανταστικό όνομα της επιχείρησης στο demo. Πάντα φανερά επινοημένο. */
  businessName: string;
  /** Πόσο κρατά περίπου, π.χ. «~40″». */
  duration: string;
  /** Οδηγία στην αρχή: τι να πατήσει ο επισκέπτης. */
  instruction: string;
  /** ΠΡΙΝ → ΜΕΤΑ, χωρίς εφευρεμένα νούμερα. */
  beforeAfter: { before: string[]; after: string[] };
  /** Τι θα μετρούσε ένα pilot (KPI), χωρίς στόχο-νούμερο. */
  pilotKpi: string;
  /** Live AI (προαιρετικό): system prompt για το /api/live. Χωρίς αυτό το demo είναι μόνο προσομοίωση. */
  live?: { system: string; placeholder: string };
}

// ---------- ChatSimulator ----------

export interface ChatCard {
  title: string;
  lines: string[];
}

export interface BotMessage {
  text: string;
  /** Προαιρετική κάρτα κάτω από το μήνυμα (π.χ. διαθέσιμα ραντεβού, πρόταση δωματίου). */
  card?: ChatCard;
  /** Ετικέτα πηγής: από πού ήξερε την απάντηση ο agent. */
  source?: string;
}

export interface ChatOption {
  label: string;
  /** Τι «γράφει» ο επισκέπτης όταν πατά το κουμπί. Προεπιλογή: το label. */
  says?: string;
  next: string;
}

/** Τι βλέπει η επιχείρηση στο panel «Τι βλέπεις εσύ» όταν φτάσει αυτό το βήμα. */
export interface OwnerEvent {
  kind: 'info' | 'handoff' | 'lead' | 'booking';
  title: string;
  lines: string[];
}

export interface ChatNode {
  bot: BotMessage[];
  options?: ChatOption[];
  owner?: OwnerEvent;
  /** Τέλος της ροής: εμφανίζεται ολοκλήρωση και CTA. */
  end?: boolean;
  /** Ένδειξη χρόνου απάντησης που δείχνει το demo, π.χ. «απάντησε σε 4″». */
  replyLabel?: string;
}

export interface ChatDemoConfig extends DemoBase {
  kind: 'chat';
  channel: Channel;
  /** Όνομα που φαίνεται στην κεφαλίδα της συνομιλίας. */
  chatTitle: string;
  start: string;
  nodes: Record<string, ChatNode>;
}

// ---------- BookingFlow ----------

export interface BookingService {
  id: string;
  name: string;
  minutes: number;
  /** Ενδεικτική τιμή, φαίνεται ως «ενδεικτικά». */
  price: string;
}

export interface BookingDay {
  id: string;
  label: string;
  /** Ώρες «ΩΩ:ΛΛ». Όσες είναι στο `taken` φαίνονται κλεισμένες. */
  slots: string[];
  taken: string[];
}

export interface BookingDemoConfig extends DemoBase {
  kind: 'booking';
  services: BookingService[];
  staff: string[];
  days: BookingDay[];
  /** Το όνομα του «πελάτη» στο demo (προσυμπληρωμένο για να τελειώνει γρήγορα). */
  customerName: string;
  /** Υπενθύμιση: κανάλι και κείμενο. Placeholders: {name} {service} {day} {time} {business} */
  reminder: { channel: Channel; text: string; confirmLabel: string; changeLabel: string };
  /** Τι γίνεται όταν ο πελάτης πατήσει «αλλαγή». */
  onChange: { text: string; owner: OwnerEvent };
  /** Τι βλέπει η επιχείρηση μετά την κράτηση. */
  ownerOnBooking: OwnerEvent;
}

// ---------- DashboardDemo (Analyst) ----------

export interface DashboardQuestion {
  label: string;
  answer: string;
  chart: { label: string; value: number }[];
  unit: string;
  suggestion: string;
}

export interface DashboardDemoConfig extends DemoBase {
  kind: 'dashboard';
  dataNote: string;
  questions: DashboardQuestion[];
}

// ---------- AutomationFlow ----------

export interface AutomationStep {
  tool: string;
  action: string;
  detail: string;
}

export interface AutomationDemoConfig extends DemoBase {
  kind: 'automation';
  trigger: string;
  steps: AutomationStep[];
  result: OwnerEvent;
}

export type DemoConfig = ChatDemoConfig | BookingDemoConfig | DashboardDemoConfig | AutomationDemoConfig;
export type DemoKind = DemoConfig['kind'];
