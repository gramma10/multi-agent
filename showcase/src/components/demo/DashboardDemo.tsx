'use client';

import { useState } from 'react';
import type { DashboardDemoConfig, DashboardQuestion } from '@/lib/demo-types';
import { useFlowSpeed, wait } from './useFlowSpeed';
import styles from './demo.module.css';

/** Analyst Agent: ερώτηση σε απλά ελληνικά → απάντηση, γράφημα, πρόταση. */
export function DashboardDemo({ demo, onComplete }: { demo: DashboardDemoConfig; onComplete: () => void }) {
  const speed = useFlowSpeed();
  const [active, setActive] = useState<DashboardQuestion | null>(null);
  const [thinking, setThinking] = useState(false);
  const [asked, setAsked] = useState<Set<string>>(new Set());

  const ask = async (q: DashboardQuestion) => {
    setActive(null);
    setThinking(true);
    await wait(900 * speed);
    setThinking(false);
    setActive(q);
    const next = new Set(asked).add(q.label);
    setAsked(next);
    if (next.size === 1) onComplete();
  };

  const max = Math.max(1, ...(active?.chart.map((c) => c.value) ?? [1]));

  return (
    <div className={styles.panel} data-testid="dashboard-demo">
      <p className="muted small">{demo.dataNote}</p>
      <div className={styles.chipsWrap}>
        {demo.questions.map((q) => (
          <button key={q.label} type="button" className="chip" aria-pressed={active?.label === q.label} onClick={() => ask(q)}>
            {q.label}
          </button>
        ))}
      </div>
      {thinking && <p className="muted">Ψάχνω στα δεδομένα…</p>}
      {active && (
        <div className={styles.answer}>
          <p>{active.answer}</p>
          <div className={styles.bars} role="img" aria-label={`Γράφημα: ${active.label}`}>
            {active.chart.map((c) => (
              <div key={c.label} className={styles.barRow}>
                <span className={styles.barLabel}>{c.label}</span>
                <span className={styles.barTrack}>
                  <span className={styles.bar} style={{ width: `${(c.value / max) * 100}%` }} />
                </span>
                <span className={styles.barValue}>
                  {c.value}
                  {active.unit}
                </span>
              </div>
            ))}
          </div>
          <p className={styles.suggestion}>
            <strong>Πρόταση:</strong> {active.suggestion}
          </p>
        </div>
      )}
    </div>
  );
}
