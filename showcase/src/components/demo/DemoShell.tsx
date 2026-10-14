import type { DemoConfig } from '@/lib/demo-types';
import { serviceName, verticalName } from '@/lib/site';
import { DemoPlayer } from './DemoPlayer';
import styles from './shell.module.css';

/**
 * Κοινό «κέλυφος» κάθε demo: εμφανές badge «Demo: ενδεικτικά δεδομένα», τίτλος, πόνος,
 * το διαδραστικό κομμάτι (DemoPlayer) και στο τέλος CTA για τον Χάρτη AI.
 */
export function DemoShell({ demo, draft }: { demo: DemoConfig; draft: boolean }) {
  return (
    <article className={styles.shell} data-testid="demo-shell" data-slug={demo.slug}>
      <header className={styles.head}>
        <div className={styles.badges}>
          <span className="badge-demo" data-testid="demo-badge">
            <span aria-hidden>⚠︎</span> Demo: ενδεικτικά δεδομένα
          </span>
          {draft && <span className="badge-draft">Πρόχειρο, δεν έχει δημοσιευτεί</span>}
        </div>
        <p className={styles.meta}>
          {verticalName(demo.vertical)} · {serviceName(demo.service)} · {demo.duration}
        </p>
        <h1>{demo.title}</h1>
        <p className={styles.tagline}>{demo.tagline}</p>
      </header>
      <DemoPlayer demo={demo} />
      <p className={`muted small ${styles.disclaimer}`}>
        Το «{demo.businessName}» είναι φανταστική επιχείρηση. Ό,τι βλέπεις είναι προσομοίωση με ενδεικτικά δεδομένα,
        όχι έργο για πελάτη.
      </p>
    </article>
  );
}
