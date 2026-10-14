import { BOOKING_URL, CTA_LABEL } from '@/lib/site';
import styles from './CtaSection.module.css';

/** Το μόνο CTA παντού: «Κλείσε τον Χάρτη AI». */
export function CtaSection({ heading, compact = false }: { heading?: string; compact?: boolean }) {
  return (
    <div className={styles.cta} id={compact ? undefined : 'xartis-ai'} data-testid="cta-xartis">
      <h2 className={styles.title}>{heading ?? 'Θες να δεις τι θα έκανε αυτό στη δική σου επιχείρηση;'}</h2>
      <p className={styles.text}>
        <strong>Χάρτης AI:</strong> δωρεάν κλήση 30 λεπτών. Φεύγεις με έναν χάρτη για το τι αξίζει να
        αυτοματοποιήσεις πρώτα και τι όχι. Εσύ κρατάς το τιμόνι.
      </p>
      <a className="btn btn-primary btn-block" href={BOOKING_URL} data-cta="xartis-ai">
        {CTA_LABEL}
      </a>
      {!compact && (
        <ol className={styles.ladder}>
          <li>
            <strong>Χάρτης AI</strong>: 30 λεπτά, δωρεάν.
          </li>
          <li>
            <strong>Pilot 2–4 εβδομάδων</strong>: ένας agent, live, με ένα KPI που συμφωνούμε από πριν. Αν δεν
            πιαστεί, συνεχίζουμε δωρεάν ή σου επιστρέφουμε τα χρήματα.
          </li>
          <li>
            <strong>Rollout</strong>: οι υπόλοιποι agents, με σταθερή τιμή ανά agent.
          </li>
        </ol>
      )}
    </div>
  );
}
