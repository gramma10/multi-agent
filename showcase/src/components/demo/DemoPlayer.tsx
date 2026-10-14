'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoConfig } from '@/lib/demo-types';
import { CtaSection } from '../CtaSection';
import { AutomationFlow } from './AutomationFlow';
import { BeforeAfter } from './BeforeAfter';
import { BookingFlow } from './BookingFlow';
import { ChatSimulator } from './ChatSimulator';
import { DashboardDemo } from './DashboardDemo';
import { LiveBox } from './LiveBox';
import { ShareButton } from './ShareButton';
import styles from './demo.module.css';

/**
 * DemoShell: badge «Demo: ενδεικτικά δεδομένα», οδηγία, το διαδραστικό κομμάτι,
 * και στο τέλος ΠΡΙΝ → ΜΕΤΑ, KPI του pilot, CTA και share.
 */
export function DemoPlayer({ demo }: { demo: DemoConfig }) {
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  const onComplete = useCallback(() => {
    setDone(true);
    if (startedAt.current !== null) setSeconds(Math.round((performance.now() - startedAt.current) / 1000));
    requestAnimationFrame(() => document.getElementById('demo-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  return (
    <div className={styles.player}>
      <p className={styles.instruction}>
        <span aria-hidden>👉</span> {demo.instruction}
      </p>
      {demo.kind === 'chat' && <ChatSimulator demo={demo} onComplete={onComplete} />}
      {demo.kind === 'booking' && <BookingFlow demo={demo} onComplete={onComplete} />}
      {demo.kind === 'dashboard' && <DashboardDemo demo={demo} onComplete={onComplete} />}
      {demo.kind === 'automation' && <AutomationFlow demo={demo} onComplete={onComplete} />}

      {done && (
        <div id="demo-result" className={`stack ${styles.result}`} data-testid="demo-complete">
          <p className={styles.doneLine}>
            ✅ Αυτό ήταν{seconds !== null ? `, σε ${seconds}″` : ''}. Έτσι θα δούλευε στη δική σου επιχείρηση, με τα δικά
            σου δεδομένα.
          </p>
          <BeforeAfter before={demo.beforeAfter.before} after={demo.beforeAfter.after} />
          <div className="card">
            <h3>Αν το δοκιμάσουμε σε pilot</h3>
            <p className="small">
              2–4 εβδομάδες, live στη δική σου επιχείρηση. Μετράμε ένα πράγμα που συμφωνούμε από πριν:{' '}
              <strong>{demo.pilotKpi}</strong>.
            </p>
          </div>
          {demo.live && <LiveBox slug={demo.slug} placeholder={demo.live.placeholder} />}
          <CtaSection compact heading="Θες το ίδιο για τη δική σου επιχείρηση;" />
          <ShareButton title={demo.title} />
        </div>
      )}
    </div>
  );
}
