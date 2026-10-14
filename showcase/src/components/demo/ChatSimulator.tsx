'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BotMessage, ChatDemoConfig, OwnerEvent } from '@/lib/demo-types';
import { OwnerPanel } from './OwnerPanel';
import { useFlowSpeed, wait } from './useFlowSpeed';
import styles from './demo.module.css';

const CHANNEL_LABEL: Record<ChatDemoConfig['channel'], string> = {
  viber: 'Viber',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  webchat: 'Chat στο site',
  email: 'Email',
};

type Msg = { from: 'user' } & { text: string } | ({ from: 'bot'; replyLabel?: string } & BotMessage);

/**
 * Συνομιλία τύπου Viber/WhatsApp/Messenger με scripted ροή.
 * Ο επισκέπτης πατά έτοιμες απαντήσεις· ο agent «πληκτρολογεί» και απαντά.
 */
export function ChatSimulator({ demo, onComplete }: { demo: ChatDemoConfig; onComplete: () => void }) {
  const speed = useFlowSpeed();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [owner, setOwner] = useState<OwnerEvent[]>([]);
  const started = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const play = useCallback(
    async (id: string) => {
      const node = demo.nodes[id];
      if (!node) throw new Error(`demo ${demo.slug}: άγνωστο βήμα «${id}»`);
      setNodeId(null);
      for (const [i, m] of node.bot.entries()) {
        setTyping(true);
        await wait((i === 0 ? 700 : 900) * speed);
        setTyping(false);
        setMessages((prev) => [...prev, { from: 'bot', ...m, replyLabel: i === 0 ? node.replyLabel : undefined }]);
        await wait(150 * speed);
      }
      if (node.owner) setOwner((prev) => [...prev, node.owner!]);
      setNodeId(id);
      if (node.end) onComplete();
    },
    [demo, speed, onComplete],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void play(demo.start);
  }, [demo.start, play]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const node = nodeId ? demo.nodes[nodeId] : null;

  return (
    <div className={styles.chatWrap}>
      <div className={styles.phone} data-channel={demo.channel}>
        <div className={styles.chatHeader}>
          <span className={styles.avatar} aria-hidden>
            {demo.chatTitle.slice(0, 1)}
          </span>
          <div>
            <div className={styles.chatTitle}>{demo.chatTitle}</div>
            <div className={styles.chatSub}>{CHANNEL_LABEL[demo.channel]} · AI agent</div>
          </div>
        </div>
        <div className={styles.messages} ref={listRef} data-testid="chat-messages">
          {messages.map((m, i) =>
            m.from === 'user' ? (
              <div key={i} className={`${styles.bubble} ${styles.user}`}>
                {m.text}
              </div>
            ) : (
              <div key={i} className={styles.botGroup}>
                {m.replyLabel && <div className={styles.replyLabel}>{m.replyLabel}</div>}
                <div className={`${styles.bubble} ${styles.bot}`}>
                  {m.text}
                  {m.card && (
                    <div className={styles.msgCard}>
                      <strong>{m.card.title}</strong>
                      <ul>
                        {m.card.lines.map((l, j) => (
                          <li key={j}>{l}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {m.source && <div className={styles.source}>Πηγή: {m.source}</div>}
              </div>
            ),
          )}
          {typing && (
            <div className={`${styles.bubble} ${styles.bot} ${styles.typing}`} aria-label="Ο agent πληκτρολογεί">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
        <div className={styles.options} data-testid="chat-options">
          {node && !node.end && node.options?.length
            ? node.options.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setMessages((prev) => [...prev, { from: 'user', text: o.says ?? o.label }]);
                    void play(o.next);
                  }}
                >
                  {o.label}
                </button>
              ))
            : !node?.end && <span className="muted small">…</span>}
        </div>
      </div>
      <OwnerPanel events={owner} businessName={demo.businessName} />
    </div>
  );
}
