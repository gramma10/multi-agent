import type { ChatDemoConfig, ChatNode, OwnerEvent } from '@/lib/demo-types';

type Lang = 'en' | 'de' | 'it' | 'el';

const COPY: Record<
  Lang,
  { flag: string; name: string; ask: string; reply: string; rooms: string[]; transfer: string; discountAsk: string; discountReply: string; book: string }
> = {
  en: {
    flag: '🇬🇧',
    name: 'English',
    ask: 'Hi! Do you have a sea view room for 2 adults, 12–15 July?',
    reply: 'Hello and thank you for your message! Yes, we have availability for 2 adults, 12–15 July (3 nights):',
    rooms: ['Sea View Double: €145/night (indicative), breakfast included', 'Junior Suite with balcony: €190/night (indicative)'],
    transfer: 'We can also arrange a transfer from the port when you arrive. Would you like me to hold one of the rooms?',
    discountAsk: 'Is there a better price if we book directly?',
    discountReply: 'When you book directly with us you get free cancellation up to 14 days before arrival and a welcome drink. Here is your booking link, the room is held for 24 hours:',
    book: '🔗 demo-suites.example/book',
  },
  de: {
    flag: '🇩🇪',
    name: 'Deutsch',
    ask: 'Hallo! Haben Sie ein Zimmer mit Meerblick für 2 Erwachsene vom 12. bis 15. Juli?',
    reply: 'Hallo und vielen Dank für Ihre Nachricht! Ja, für 2 Erwachsene vom 12. bis 15. Juli (3 Nächte) haben wir frei:',
    rooms: ['Doppelzimmer Meerblick: 145 €/Nacht (Richtwert), mit Frühstück', 'Junior Suite mit Balkon: 190 €/Nacht (Richtwert)'],
    transfer: 'Gerne organisieren wir auch einen Transfer vom Hafen. Soll ich eines der Zimmer für Sie reservieren?',
    discountAsk: 'Gibt es einen besseren Preis bei Direktbuchung?',
    discountReply: 'Bei Direktbuchung haben Sie kostenlose Stornierung bis 14 Tage vor Anreise und einen Willkommensdrink. Hier ist Ihr Buchungslink, das Zimmer ist 24 Stunden für Sie reserviert:',
    book: '🔗 demo-suites.example/book',
  },
  it: {
    flag: '🇮🇹',
    name: 'Italiano',
    ask: 'Ciao! Avete una camera vista mare per 2 adulti dal 12 al 15 luglio?',
    reply: 'Ciao e grazie per il messaggio! Sì, abbiamo disponibilità per 2 adulti dal 12 al 15 luglio (3 notti):',
    rooms: ['Doppia vista mare: 145 €/notte (indicativo), colazione inclusa', 'Junior Suite con balcone: 190 €/notte (indicativo)'],
    transfer: 'Possiamo anche organizzare il transfer dal porto. Vuole che le tenga una delle camere?',
    discountAsk: 'C’è un prezzo migliore prenotando direttamente?',
    discountReply: 'Prenotando direttamente ha la cancellazione gratuita fino a 14 giorni prima dell’arrivo e un drink di benvenuto. Ecco il link, la camera è bloccata per 24 ore:',
    book: '🔗 demo-suites.example/book',
  },
  el: {
    flag: '🇬🇷',
    name: 'Ελληνικά',
    ask: 'Γεια σας! Έχετε δωμάτιο με θέα θάλασσα για 2 ενήλικες, 12–15 Ιουλίου;',
    reply: 'Γεια σας και ευχαριστούμε για το μήνυμα! Ναι, για 2 ενήλικες 12–15 Ιουλίου (3 νύχτες) έχουμε διαθεσιμότητα:',
    rooms: ['Δίκλινο με θέα θάλασσα: €145/νύχτα (ενδεικτικά), με πρωινό', 'Junior Suite με μπαλκόνι: €190/νύχτα (ενδεικτικά)'],
    transfer: 'Μπορούμε να κανονίσουμε και μεταφορά από το λιμάνι. Θέλετε να σας κρατήσω ένα από τα δωμάτια;',
    discountAsk: 'Υπάρχει καλύτερη τιμή αν κλείσουμε απευθείας;',
    discountReply: 'Με απευθείας κράτηση έχετε δωρεάν ακύρωση έως 14 ημέρες πριν την άφιξη και ένα welcome drink. Ορίστε το link, το δωμάτιο κρατιέται για 24 ώρες:',
    book: '🔗 demo-suites.example/book',
  },
};

function leadEvent(lang: Lang): OwnerEvent {
  return {
    kind: 'lead',
    title: 'Νέο lead: ζεστό',
    lines: [
      `Γλώσσα: ${COPY[lang].name}`,
      '2 ενήλικες · 12–15 Ιουλίου (3 νύχτες) · θέλει θέα θάλασσα',
      'Προτάθηκαν: Δίκλινο θέα θάλασσα, Junior Suite',
      'Ρώτησε για τιμή απευθείας κράτησης → στάλθηκε link, το δωμάτιο κρατιέται 24 ώρες',
    ],
  };
}

function branch(lang: Lang): Record<string, ChatNode> {
  const c = COPY[lang];
  return {
    [`${lang}-reply`]: {
      replyLabel: 'απάντησε σε δευτερόλεπτα',
      bot: [
        { text: c.reply, card: { title: 'Demo Suites Naxos', lines: c.rooms } },
        { text: c.transfer },
      ],
      owner: { kind: 'info', title: 'Νέο ερώτημα από το site', lines: [`${c.name}: απαντήθηκε αυτόματα σε δευτερόλεπτα`] },
      options: [{ label: c.discountAsk, next: `${lang}-direct` }],
    },
    [`${lang}-direct`]: {
      replyLabel: 'απάντησε σε δευτερόλεπτα',
      bot: [{ text: c.discountReply, card: { title: 'Απευθείας κράτηση', lines: [c.book] } }],
      owner: leadEvent(lang),
      end: true,
    },
  };
}

export const demo: ChatDemoConfig = {
  kind: 'chat',
  slug: 'xenodocheia-sales',
  vertical: 'xenodocheia',
  service: 'sales_agent',
  title: 'Κάθε ερώτημα για δωμάτιο παίρνει απάντηση σε δευτερόλεπτα, στη γλώσσα του επισκέπτη',
  tagline: 'Ενώ εσύ είσαι στη reception, ο agent απαντά στα γερμανικά, προτείνει δωμάτιο και στέλνει link για απευθείας κράτηση.',
  businessName: 'Demo Suites Naxos',
  duration: '~30″',
  instruction: 'Είσαι τουρίστας. Διάλεξε γλώσσα και στείλε ερώτημα για δωμάτιο.',
  channel: 'webchat',
  chatTitle: 'Demo Suites Naxos',
  start: 'lang',
  nodes: {
    lang: {
      bot: [{ text: 'Welcome · Willkommen · Benvenuti · Καλώς ήρθατε! 👋' }],
      options: (Object.keys(COPY) as Lang[]).map((l) => ({
        label: `${COPY[l].flag} ${COPY[l].name}`,
        says: COPY[l].ask,
        next: `${l}-reply`,
      })),
    },
    ...branch('en'),
    ...branch('de'),
    ...branch('it'),
    ...branch('el'),
  },
  beforeAfter: {
    before: [
      'Τα ερωτήματα περιμένουν ώρες, μερικές φορές μέχρι την επόμενη μέρα.',
      'Απαντάς βιαστικά, σε γλώσσα που δεν είναι η δική σου, και ξεχνάς μία από τις ερωτήσεις.',
      'Στο μεταξύ ο επισκέπτης κλείνει από πλατφόρμα, με προμήθεια.',
    ],
    after: [
      'Κάθε ερώτημα παίρνει πλήρη απάντηση σε δευτερόλεπτα, στη γλώσσα του επισκέπτη.',
      'Με link για απευθείας κράτηση και πρόταση για ό,τι άλλο προσφέρεις (μεταφορά, πρωινό).',
      'Εσύ βλέπεις κάθε lead στα ελληνικά και μπαίνεις μόνο όταν χρειάζεται άνθρωπος.',
    ],
  },
  live: {
    system:
      'You are the booking assistant of «Demo Suites Naxos» (a fictional hotel in a demo). Rooms: Sea View Double €145/night with breakfast, Junior Suite with balcony €190/night (indicative prices). Direct booking: free cancellation up to 14 days before arrival, welcome drink. Transfer from the port on request. Reply in the language of the guest. Never promise discounts or availability beyond this; offer to have the owner confirm.',
    placeholder: 'π.χ. Do you allow pets?',
  },
  pilotKpi: 'πόσες απευθείας κρατήσεις έρχονται από ερωτήματα, πριν και μετά',
};
