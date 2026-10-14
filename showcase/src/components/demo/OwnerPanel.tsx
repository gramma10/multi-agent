import type { OwnerEvent } from '@/lib/demo-types';
import styles from './demo.module.css';

const ICON: Record<OwnerEvent['kind'], string> = {
  info: 'ℹ️',
  handoff: '🙋',
  lead: '🔥',
  booking: '📅',
};

/** «Τι βλέπεις εσύ»: η πλευρά της επιχείρησης. Δείχνει ότι ο άνθρωπος κρατά το τιμόνι. */
export function OwnerPanel({ events, businessName }: { events: OwnerEvent[]; businessName: string }) {
  return (
    <aside className={styles.owner} aria-live="polite" data-testid="owner-panel">
      <h3 className={styles.ownerTitle}>Τι βλέπεις εσύ ({businessName})</h3>
      {events.length === 0 ? (
        <p className="muted small">Μόλις γίνει κάτι που σε αφορά, εμφανίζεται εδώ.</p>
      ) : (
        <ul className={styles.ownerList}>
          {events.map((e, i) => (
            <li key={i} className={styles.ownerItem} data-kind={e.kind}>
              <strong>
                <span aria-hidden>{ICON[e.kind]}</span> {e.title}
              </strong>
              <ul>
                {e.lines.map((l, j) => (
                  <li key={j}>{l}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
