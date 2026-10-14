/**
 * Βαθμός 0–100 ενός lead για ένα κελί (κλάδος × υπηρεσία). Κάθε μόριο έχει λόγο, ώστε ο
 * Outreach να ξέρει ΠΟΙΟ σήμα στηρίζει την προσωποποίηση και ο άνθρωπος να καταλαβαίνει τη σειρά.
 *
 *  fit        0–40  ταιριάζει στον κλάδο (ΚΑΔ ή κατηγορία Places)
 *  μέγεθος    0–20  κριτικές ως ένδειξη μεγέθους (στόχος: 5–50 άτομα, όχι αλυσίδες)
 *  πόνος      0–30  σήματα ότι λείπει αυτό που λύνει η υπηρεσία
 *  επαφή      0–10  υπάρχει εταιρικός τρόπος επικοινωνίας
 */
export interface ScoreInput {
  service: string;
  kadMatch: boolean;
  foundByVerticalQuery: boolean;
  reviewsCount: number | null;
  hasWebsite: boolean;
  signals: { has_online_booking?: boolean; has_chat?: boolean; has_viber?: boolean; has_whatsapp?: boolean; last_updated_year?: number | null };
  hasRoleEmail: boolean;
  hasForm: boolean;
  hasPhone: boolean;
  currentYear: number;
}

export interface Score {
  score: number;
  reasons: string[];
}

export function scoreLead(i: ScoreInput): Score {
  const reasons: string[] = [];
  let s = 0;

  if (i.kadMatch || i.foundByVerticalQuery) {
    s += 40;
    reasons.push(i.kadMatch ? 'fit: ΚΑΔ του κλάδου' : 'fit: κατηγορία του κλάδου');
  } else {
    s += 10;
    reasons.push('fit: αβέβαιο');
  }

  const rc = i.reviewsCount ?? 0;
  const size = rc === 0 ? 0 : rc < 20 ? 6 : rc < 100 ? 14 : rc < 500 ? 20 : 12;
  if (size) reasons.push(`μέγεθος: ${rc} κριτικές`);
  s += size;

  const sig = i.signals;
  let pain = 0;
  const add = (points: number, reason: string) => {
    pain += points;
    reasons.push(reason);
  };
  switch (i.service) {
    case 'booking_system':
      if (i.hasWebsite && !sig.has_online_booking) add(30, 'πόνος: χωρίς online κράτηση');
      else if (!i.hasWebsite) add(20, 'πόνος: χωρίς website (κρατήσεις μόνο τηλεφωνικά;)');
      break;
    case 'support_agent':
    case 'sales_agent':
      if (i.hasWebsite && !sig.has_chat) add(20, 'πόνος: χωρίς chat στο site');
      if (sig.has_viber || sig.has_whatsapp) add(10, 'πόνος: δέχεται μηνύματα σε Viber/WhatsApp');
      break;
    default:
      if (i.hasWebsite) add(10, 'έχει website (ψηφιακή παρουσία)');
      if (sig.last_updated_year && i.currentYear - sig.last_updated_year >= 3) add(10, 'site χωρίς ενημέρωση 3+ χρόνια');
  }
  s += Math.min(30, pain);

  let contact = 0;
  if (i.hasRoleEmail) contact += 6;
  if (i.hasForm) contact += 4;
  if (i.hasPhone) contact += 2;
  if (contact) reasons.push('επαφή: ' + [i.hasRoleEmail && 'email', i.hasForm && 'φόρμα', i.hasPhone && 'τηλέφωνο'].filter(Boolean).join(', '));
  s += Math.min(10, contact);

  return { score: Math.max(0, Math.min(100, s)), reasons };
}
