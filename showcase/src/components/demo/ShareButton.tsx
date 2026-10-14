'use client';

import { useState } from 'react';

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href.split('?')[0]!;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* ο χρήστης το ακύρωσε */
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
  };
  return (
    <button type="button" className="btn btn-secondary btn-block" onClick={share}>
      {copied ? 'Αντιγράφηκε το link' : 'Στείλ’ το σε κάποιον που το χρειάζεται'}
    </button>
  );
}
