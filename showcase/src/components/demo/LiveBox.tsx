'use client';

import { useEffect, useState } from 'react';
import styles from './demo.module.css';

type Turn = { role: 'user' | 'assistant'; content: string };

/**
 * «Ρώτα κάτι δικό σου»: εμφανίζεται μόνο αν το /api/live είναι ενεργό (κλειδί + μοντέλο στο env).
 * Χωρίς αυτό δεν φαίνεται καθόλου και το demo μένει ολόκληρο προσομοίωση.
 */
export function LiveBox({ slug, placeholder }: { slug: string; placeholder: string }) {
  const [enabled, setEnabled] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/live')
      .then((r) => r.json() as Promise<{ enabled: boolean }>)
      .then((j) => alive && setEnabled(j.enabled))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!enabled) return null;

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setText('');
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/live', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, messages: next }),
      });
      const j = (await r.json()) as { reply?: string; error?: string };
      if (!r.ok || !j.reply) {
        setError(j.error === 'rate_limited' ? 'Πολλές ερωτήσεις. Δοκίμασε σε λίγο.' : 'Το live AI δεν είναι διαθέσιμο τώρα.');
      } else {
        setTurns([...next, { role: 'assistant', content: j.reply }]);
      }
    } catch {
      setError('Το live AI δεν είναι διαθέσιμο τώρα.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel} data-testid="live-box">
      <h3>Ρώτα κάτι δικό σου (live AI)</h3>
      <div className={styles.messages} style={{ minHeight: 0 }}>
        {turns.map((t, i) => (
          <div key={i} className={`${styles.bubble} ${t.role === 'user' ? styles.user : styles.bot}`}>
            {t.content}
          </div>
        ))}
      </div>
      {error && <p className="small muted">{error}</p>}
      <form
        className={styles.liveForm}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={500} aria-label="Η ερώτησή σου" />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? '…' : 'Στείλε'}
        </button>
      </form>
    </div>
  );
}
