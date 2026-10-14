'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import styles from './hub.module.css';

export interface HubCard {
  slug: string;
  title: string;
  tagline: string;
  vertical: string;
  verticalName: string;
  service: string;
  serviceName: string;
  duration: string;
  draft: boolean;
}

/** Λίστα demos με φίλτρα ανά κλάδο και υπηρεσία. Τα φίλτρα δείχνουν μόνο ό,τι έχει demos. */
export function HubDemos({ cards }: { cards: HubCard[] }) {
  const [vertical, setVertical] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);

  const verticals = useMemo(() => uniq(cards.map((c) => [c.vertical, c.verticalName] as const)), [cards]);
  const services = useMemo(() => uniq(cards.map((c) => [c.service, c.serviceName] as const)), [cards]);
  const shown = cards.filter((c) => (!vertical || c.vertical === vertical) && (!service || c.service === service));

  return (
    <div>
      {cards.length > 1 && (
        <div className={styles.filters} role="group" aria-label="Φίλτρα">
          <div className={styles.filterRow}>
            <button type="button" className="chip" aria-pressed={vertical === null} onClick={() => setVertical(null)}>
              Όλοι οι κλάδοι
            </button>
            {verticals.map(([id, name]) => (
              <button key={id} type="button" className="chip" aria-pressed={vertical === id} onClick={() => setVertical(vertical === id ? null : id)}>
                {name}
              </button>
            ))}
          </div>
          <div className={styles.filterRow}>
            <button type="button" className="chip" aria-pressed={service === null} onClick={() => setService(null)}>
              Όλες οι υπηρεσίες
            </button>
            {services.map(([id, name]) => (
              <button key={id} type="button" className="chip" aria-pressed={service === id} onClick={() => setService(service === id ? null : id)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className={styles.cards} data-testid="demo-cards">
        {shown.map((c) => (
          <li key={c.slug}>
            <Link href={`/demos/${c.slug}`} className={styles.card} data-testid="demo-card">
              <span className={styles.cardMeta}>
                {c.verticalName} · {c.serviceName}
                {c.draft && <span className="badge-draft">Πρόχειρο</span>}
              </span>
              <span className={styles.cardTitle}>{c.title}</span>
              <span className={styles.cardText}>{c.tagline}</span>
              <span className={styles.cardCta}>Δοκίμασέ το ({c.duration}) →</span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && cards.length > 0 && <p className="muted">Δεν υπάρχει ακόμα demo για αυτόν τον συνδυασμό.</p>}
    </div>
  );
}

function uniq(pairs: (readonly [string, string])[]): (readonly [string, string])[] {
  const seen = new Map<string, string>();
  for (const [id, name] of pairs) if (!seen.has(id)) seen.set(id, name);
  return [...seen.entries()];
}
