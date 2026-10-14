import type { RenderedMessage } from '../campaigns/render.ts';
import { findBanned, findClientClaims, findUnsourcedNumbers, fold } from './brand.ts';

/**
 * Deterministic QA (agents/qa.md): τρέχει σε ΚΑΘΕ μήνυμα, χωρίς LLM.
 *   Q1 προσωποποίηση χωρίς πηγή      Q6 λέξεις spam
 *   Q2 εφευρεμένο νούμερο/πελάτης      Q7 χωρίς αποστολέα ή διαγραφή
 *   Q3 λάθος κλάδος ή όνομα            Q8 χωρίς link demo ή CTA Χάρτη AI
 *   Q4 κακά ελληνικά (μικτά αλφάβητα)  Q9 placeholders που δεν γέμισαν
 *   Q5 μήκος εκτός ορίων               Q10 λέξεις της μαύρης λίστας του brand
 */

export type Rule = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q7' | 'Q8' | 'Q9' | 'Q10';
export const RULES: Record<Rule, string> = {
  Q1: 'ισχυρισμός για το lead χωρίς πηγή',
  Q2: 'εφευρεμένο νούμερο ή πελάτης',
  Q3: 'λάθος κλάδος ή όνομα',
  Q4: 'κακά ελληνικά',
  Q5: 'μήκος εκτός ορίων',
  Q6: 'λέξεις που ενεργοποιούν spam φίλτρα',
  Q7: 'λείπουν στοιχεία αποστολέα ή διαγραφή',
  Q8: 'λείπει link demo ή CTA Χάρτη AI',
  Q9: 'placeholders που δεν συμπληρώθηκαν',
  Q10: 'λέξεις της μαύρης λίστας του brand',
};

export interface QaFinding {
  rule: Rule;
  detail: string;
}

/** Λέξεις/μοτίβα που ενεργοποιούν spam φίλτρα. Το «δωρεάν» μόνο του επιτρέπεται (CTA), με θαυμαστικά ή κεφαλαία όχι. */
export const SPAM_PATTERNS: Array<[RegExp, string]> = [
  [/!{2,}/, 'πολλά θαυμαστικά'],
  [/δωρεαν\s*!/, '«δωρεάν!»'],
  [/εγγυημεν/, '«εγγυημένο»'],
  [/κερδισ(ε|τε)\b/, '«κέρδισε»'],
  [/\b100\s*%/, '«100%»'],
  [/επειγον/, '«επείγον»'],
  [/μονο σημερα|ληγει σημερα|τελευταια ευκαιρια/, 'πίεση χρόνου'],
  [/[$€]{2,}/, 'σύμβολα χρημάτων'],
  [/\b(click here|act now|buy now|winner|risk[- ]free|free!+)\b/, 'αγγλικές λέξεις spam'],
  [/κανε κλικ εδω|πατησε εδω/, '«κάνε κλικ εδώ»'],
];

/** Ακρωνύμια που επιτρέπονται σε κεφαλαία. */
const ACRONYMS = new Set(['ΕΟΠΥΥ', 'ΑΦΜ', 'ΑΜΚΑ', 'ΓΕΜΗ', 'ΑΑΔΕ', 'ΚΑΔ', 'ΑΙ', 'AI', 'KPI', 'CRM', 'SEO', 'CTA', 'POS', 'ΦΠΑ', 'ΙΚΕ', 'ΟΕ', 'ΕΕ', 'GDPR', 'URL', 'PDF', 'OK', 'ΠΡΙΝ', 'ΜΕΤΑ', 'ΑΝΟΙΓΜΑ', 'ΕΡΩΤΗΣΕΙΣ', 'ΑΝΤΙΡΡΗΣΕΙΣ', 'ΚΛΕΙΣΙΜΟ']);

export interface QaContext {
  banned: readonly string[];
  /** Όροι άλλων κλάδων (από το matrix): αν εμφανιστούν, ο κλάδος είναι λάθος (Q3). */
  otherVerticalTerms: string[];
}

export const LIMITS = { subject: 60, emailMinWords: 50, emailMaxWords: 150, draftMaxChars: 400 };

const words = (s: string) => s.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;

export function checkMessage(m: RenderedMessage, ctx: QaContext): QaFinding[] {
  const f: QaFinding[] = [];
  const add = (rule: Rule, detail: string) => f.push({ rule, detail });

  // Q1: κάθε πεδίο προσωποποίησης πρέπει να έχει πηγή
  for (const u of m.unsourced) if (!u.startsWith('{')) add('Q1', `πεδίο χωρίς πηγή: ${u}`);

  // Q2: νούμερα-ισχυρισμοί χωρίς πηγή, «πελάτες μας»
  const content = m.text.replace(m.parts.sender, '').replace(m.parts.unsubscribe, '');
  for (const n of findUnsourcedNumbers(content)) add('Q2', n);
  for (const c of findClientClaims(content)) add('Q2', `φράση: ${c}`);

  // Q3: όνομα και κλάδος
  if (m.usesBusinessName && !m.text.includes(m.businessName)) add('Q3', 'λείπει/λάθος όνομα επιχείρησης');
  const folded = fold(content);
  for (const t of ctx.otherVerticalTerms) if (folded.includes(fold(t))) add('Q3', `όρος άλλου κλάδου: «${t}»`);

  // Q4: λατινικοί και ελληνικοί χαρακτήρες μέσα στην ίδια λέξη (συνηθισμένο λάθος/τέχνασμα)
  const mixed = content.match(/[\p{Script=Greek}]+[A-Za-z]+[\p{Script=Greek}]*|[A-Za-z]+[\p{Script=Greek}]+/gu);
  if (mixed) add('Q4', `μικτά αλφάβητα: ${mixed.slice(0, 3).join(', ')}`);

  // Q5: μήκος
  const kind = m.channel.startsWith('email') ? 'email' : m.channel === 'phone_b2b' ? 'call' : 'draft';
  if (kind === 'email') {
    if ((m.subject ?? '').length > LIMITS.subject) add('Q5', `θέμα ${m.subject!.length} χαρακτήρες (όριο ${LIMITS.subject})`);
    const bodyOnly = m.body.replace(m.parts.sender, '').replace(m.parts.unsubscribe, '');
    const n = words(bodyOnly);
    if (n < LIMITS.emailMinWords || n > LIMITS.emailMaxWords) add('Q5', `σώμα ${n} λέξεις (${LIMITS.emailMinWords}–${LIMITS.emailMaxWords})`);
  } else if (kind === 'draft') {
    // Τα links δεν μετράνε (στο DM γίνονται προεπισκόπηση)· μετράει ό,τι διαβάζει ο άνθρωπος.
    const core = m.body.split('\n\n').slice(0, -2).join('\n\n').replace(/https?:\/\/\S+/g, '');
    if (core.length > LIMITS.draftMaxChars) add('Q5', `DM ${core.length} χαρακτήρες χωρίς links (όριο ${LIMITS.draftMaxChars})`);
  }

  // Q6: spam (μόνο για ό,τι γράφεται: τα σενάρια κλήσεων δεν περνούν από φίλτρα)
  if (kind !== 'call') for (const [re, label] of SPAM_PATTERNS) if (re.test(fold(m.text))) add('Q6', label);
  const caps = (content.replace(/https?:\/\/\S+/g, ' ').match(/(?<!\p{L})\p{Lu}{4,}(?!\p{L})/gu) ?? []).filter((w) => !ACRONYMS.has(w));
  if (caps.length) add('Q6', `λέξεις σε κεφαλαία: ${caps.slice(0, 3).join(', ')}`);

  // Q7: αποστολέας και διαγραφή
  if (kind === 'email' && !m.body.includes(m.parts.sender)) add('Q7', 'λείπουν στοιχεία αποστολέα');
  if (kind !== 'call' && !m.body.includes(m.parts.unsubscribe)) add('Q7', 'λείπει τρόπος διαγραφής');

  // Q8: demo και CTA
  if (kind !== 'call' && !m.text.includes(m.parts.demoUrl.split('?')[0]!)) add('Q8', 'λείπει link στο demo');
  if (!/χαρτη[ςσ]? ai/.test(fold(m.text))) add('Q8', 'λείπει το CTA «Χάρτης AI»');
  if (kind !== 'call' && !m.text.includes(m.parts.bookingUrl)) add('Q8', 'λείπει το link για τον Χάρτη AI');

  // Q9: placeholders που έμειναν (και στα στοιχεία αποστολέα: {{TODO}} στο channels.yaml)
  const left = m.text.match(/\{\{[^}]*\}\}/g);
  if (left) add('Q9', `έμειναν: ${[...new Set(left)].slice(0, 3).join(', ')}`);

  // Q10: brand
  for (const b of findBanned(content, ctx.banned)) add('Q10', b);
  return f;
}
