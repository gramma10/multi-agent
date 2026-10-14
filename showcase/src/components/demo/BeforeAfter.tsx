import styles from './demo.module.css';

/** ΠΡΙΝ → ΜΕΤΑ, χωρίς νούμερα που δεν έχουν πηγή. */
export function BeforeAfter({ before, after }: { before: string[]; after: string[] }) {
  return (
    <div className={`grid grid-2 ${styles.beforeAfter}`} data-testid="before-after">
      <div className={styles.before}>
        <h3>Πριν</h3>
        <ul>
          {before.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
      <div className={styles.after}>
        <h3>Μετά</h3>
        <ul>
          {after.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
