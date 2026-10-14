import styles from './prose.module.css';

/** Markdown που έχει ήδη μετατραπεί σε HTML στο build, χωρίς raw HTML (βλ. lib/content.ts). */
export function Prose({ html, testId }: { html: string; testId?: string }) {
  return <div className={styles.prose} data-testid={testId} dangerouslySetInnerHTML={{ __html: html }} />;
}
