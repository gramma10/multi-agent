import { HubDemos, type HubCard } from '@/components/HubDemos';
import styles from '@/components/hub.module.css';
import { isPublished, serviceName, verticalName, visibleDemos } from '@/lib/site';

export default function Hub() {
  const cards: HubCard[] = visibleDemos().map((d) => ({
    slug: d.slug,
    title: d.title,
    tagline: d.tagline,
    vertical: d.vertical,
    verticalName: verticalName(d.vertical),
    service: d.service,
    serviceName: serviceName(d.service),
    duration: d.duration,
    draft: !isPublished(d.slug),
  }));

  return (
    <div className="container">
      <section className={styles.hero}>
        <h1>Δες έναν AI agent να δουλεύει στη δική σου δουλειά. Σε λιγότερο από ένα λεπτό.</h1>
        <p className={styles.lead}>
          Agents που απαντούν στους πελάτες σου, κλείνουν ραντεβού και σου γλιτώνουν ώρες κάθε εβδομάδα. Διάλεξε τον κλάδο
          σου και δοκίμασέ το από το κινητό.
        </p>
        <p className={styles.honest}>
          Τα demos είναι concepts με ενδεικτικά δεδομένα και φανταστικές επιχειρήσεις. Δεν είναι έργα πελατών.
        </p>
      </section>

      <section aria-labelledby="demos-title">
        <h2 id="demos-title" className="visually-hidden">
          Demos
        </h2>
        {cards.length > 0 ? (
          <HubDemos cards={cards} />
        ) : (
          <div className={styles.empty} data-testid="hub-empty">
            <h3>Τα πρώτα demos έρχονται.</h3>
            <p className="muted">
              Μέχρι τότε, κλείσε τον Χάρτη AI και θα σου δείξουμε live τι θα έκανε ένας agent στη δική σου επιχείρηση.
            </p>
          </div>
        )}
      </section>

      <section className={styles.how}>
        <h2>Πώς δουλεύει</h2>
        <ol>
          <li>Κάνουμε μια κλήση 30 λεπτών: τι σου τρώει χρόνο, πού χάνεις πελάτες.</li>
          <li>Ξεκινάμε από ένα πράγμα, με pilot 2–4 εβδομάδων και ένα KPI που συμφωνούμε από πριν.</li>
          <li>Ο agent δουλεύει μαζί με την ομάδα σου. Ό,τι χρειάζεται άνθρωπο, πάει σε άνθρωπο.</li>
        </ol>
      </section>
    </div>
  );
}
