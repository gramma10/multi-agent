'use client';

import { useState } from 'react';
import type { BookingDemoConfig, BookingService, OwnerEvent } from '@/lib/demo-types';
import { OwnerPanel } from './OwnerPanel';
import { useFlowSpeed, wait } from './useFlowSpeed';
import styles from './demo.module.css';

type Step = 'service' | 'staff' | 'slot' | 'confirm' | 'reminder' | 'done';
const STEP_NO: Partial<Record<Step, number>> = { service: 1, staff: 2, slot: 3, confirm: 4 };

function fill(tpl: string, v: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
}

/**
 * Κράτηση σε 4 βήματα + υπενθύμιση σε Viber/WhatsApp. Δείχνει και τι βλέπει η επιχείρηση.
 */
export function BookingFlow({ demo, onComplete }: { demo: BookingDemoConfig; onComplete: () => void }) {
  const speed = useFlowSpeed();
  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<BookingService | null>(null);
  const [staff, setStaff] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ day: string; time: string } | null>(null);
  const [owner, setOwner] = useState<OwnerEvent[]>([]);
  const [reply, setReply] = useState<'confirm' | 'change' | null>(null);
  const [sending, setSending] = useState(false);

  const vars = {
    name: demo.customerName,
    service: service?.name ?? '',
    day: demo.days.find((d) => d.id === slot?.day)?.label ?? '',
    time: slot?.time ?? '',
    business: demo.businessName,
    staff: staff ?? '',
  };

  const confirm = async () => {
    setSending(true);
    await wait(700 * speed);
    setOwner((prev) => [...prev, { ...demo.ownerOnBooking, lines: demo.ownerOnBooking.lines.map((l) => fill(l, vars)) }]);
    setSending(false);
    setStep('reminder');
  };

  const answer = async (kind: 'confirm' | 'change') => {
    setReply(kind);
    await wait(600 * speed);
    if (kind === 'change') {
      setOwner((prev) => [...prev, { ...demo.onChange.owner, lines: demo.onChange.owner.lines.map((l) => fill(l, vars)) }]);
    } else {
      setOwner((prev) => [...prev, { kind: 'booking', title: 'Επιβεβαιώθηκε', lines: [fill('{name}: {day} {time} επιβεβαιωμένο.', vars)] }]);
    }
    setStep('done');
    onComplete();
  };

  return (
    <div className={styles.chatWrap}>
      <div className={styles.panel} data-testid="booking-flow">
        {STEP_NO[step] && (
          <div className={styles.progress} aria-label={`Βήμα ${STEP_NO[step]} από 4`}>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} data-active={n <= (STEP_NO[step] ?? 0)} />
            ))}
          </div>
        )}

        {step === 'service' && (
          <>
            <h3>Τι θέλεις να κλείσεις;</h3>
            <div className={styles.listButtons}>
              {demo.services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => {
                    setService(s);
                    setStep('staff');
                  }}
                >
                  <span>{s.name}</span>
                  <span className="muted small">
                    {s.minutes}′ · {s.price}
                  </span>
                </button>
              ))}
            </div>
            <p className="muted small">Οι τιμές είναι ενδεικτικές, για το demo.</p>
          </>
        )}

        {step === 'staff' && (
          <>
            <h3>Με ποιον;</h3>
            <div className={styles.chipsWrap}>
              {demo.staff.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setStaff(s);
                    setStep('slot');
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'slot' && (
          <>
            <h3>Πότε σε βολεύει;</h3>
            {demo.days.map((d) => (
              <div key={d.id} className={styles.day}>
                <div className={styles.dayLabel}>{d.label}</div>
                <div className={styles.slots}>
                  {d.slots.map((t) => {
                    const taken = d.taken.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        className={styles.slot}
                        disabled={taken}
                        aria-label={taken ? `${t} κλεισμένο` : `${d.label} ${t}`}
                        onClick={() => {
                          setSlot({ day: d.id, time: t });
                          setStep('confirm');
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {step === 'confirm' && (
          <>
            <h3>Επιβεβαίωση</h3>
            <dl className={styles.summary}>
              <dt>Υπηρεσία</dt>
              <dd>{service?.name}</dd>
              <dt>Με</dt>
              <dd>{staff}</dd>
              <dt>Πότε</dt>
              <dd>
                {vars.day} {vars.time}
              </dd>
              <dt>Όνομα</dt>
              <dd>{demo.customerName}</dd>
            </dl>
            <button type="button" className="btn btn-primary btn-block" onClick={confirm} disabled={sending}>
              {sending ? 'Κλείνει…' : 'Κλείσε το ραντεβού'}
            </button>
          </>
        )}

        {(step === 'reminder' || step === 'done') && (
          <>
            <h3>Την προηγούμενη μέρα, στο {demo.reminder.channel === 'viber' ? 'Viber' : 'κινητό'} του πελάτη:</h3>
            <div className={styles.phone} data-channel={demo.reminder.channel}>
              <div className={styles.chatHeader}>
                <span className={styles.avatar} aria-hidden>
                  {demo.businessName.slice(0, 1)}
                </span>
                <div>
                  <div className={styles.chatTitle}>{demo.businessName}</div>
                  <div className={styles.chatSub}>Υπενθύμιση ραντεβού</div>
                </div>
              </div>
              <div className={styles.messages}>
                <div className={`${styles.bubble} ${styles.bot}`} data-testid="reminder">
                  {fill(demo.reminder.text, vars)}
                </div>
                {reply && (
                  <div className={`${styles.bubble} ${styles.user}`}>
                    {reply === 'confirm' ? demo.reminder.confirmLabel : demo.reminder.changeLabel}
                  </div>
                )}
                {reply === 'change' && step === 'done' && (
                  <div className={`${styles.bubble} ${styles.bot}`}>{fill(demo.onChange.text, vars)}</div>
                )}
              </div>
              {!reply && (
                <div className={styles.options}>
                  <button type="button" className="chip" onClick={() => answer('confirm')}>
                    {demo.reminder.confirmLabel}
                  </button>
                  <button type="button" className="chip" onClick={() => answer('change')}>
                    {demo.reminder.changeLabel}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <OwnerPanel events={owner} businessName={demo.businessName} />
    </div>
  );
}
