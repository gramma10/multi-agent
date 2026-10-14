'use client';

import { useState } from 'react';
import type { AutomationDemoConfig, OwnerEvent } from '@/lib/demo-types';
import { OwnerPanel } from './OwnerPanel';
import { useFlowSpeed, wait } from './useFlowSpeed';
import styles from './demo.module.css';

/** Αυτοματισμός: τα βήματα ανάμεσα στα εργαλεία «τρέχουν» ένα-ένα μπροστά στον επισκέπτη. */
export function AutomationFlow({ demo, onComplete }: { demo: AutomationDemoConfig; onComplete: () => void }) {
  const speed = useFlowSpeed();
  const [current, setCurrent] = useState(-1);
  const [running, setRunning] = useState(false);
  const [owner, setOwner] = useState<OwnerEvent[]>([]);

  const run = async () => {
    setRunning(true);
    for (let i = 0; i < demo.steps.length; i++) {
      setCurrent(i);
      await wait(900 * speed);
    }
    setCurrent(demo.steps.length);
    setOwner([demo.result]);
    setRunning(false);
    onComplete();
  };

  return (
    <div className={styles.chatWrap}>
      <div className={styles.panel} data-testid="automation-flow">
        <p>
          <strong>Όταν:</strong> {demo.trigger}
        </p>
        <ol className={styles.flow}>
          {demo.steps.map((s, i) => (
            <li key={i} className={styles.flowStep} data-state={i < current ? 'done' : i === current ? 'running' : 'idle'}>
              <span className={styles.flowTool}>{s.tool}</span>
              <span>
                <strong>{s.action}</strong>
                <br />
                <span className="muted small">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
        {current < 0 && (
          <button type="button" className="btn btn-primary btn-block" onClick={run} disabled={running}>
            Τρέξε τον αυτοματισμό
          </button>
        )}
      </div>
      <OwnerPanel events={owner} businessName={demo.businessName} />
    </div>
  );
}
