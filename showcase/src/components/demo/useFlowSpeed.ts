'use client';

import { useSyncExternalStore } from 'react';

/**
 * Πολλαπλασιαστής καθυστερήσεων. Με `?fast=1` στο URL όλα τρέχουν ~10x πιο γρήγορα
 * (για tests και για όποιον θέλει να το δει στα γρήγορα). Χωρίς αυτό: ρυθμός «ανθρώπου».
 */
function read(): number {
  if (typeof window === 'undefined') return 1;
  return new URLSearchParams(window.location.search).get('fast') === '1' ? 0.1 : 1;
}

export function useFlowSpeed(): number {
  return useSyncExternalStore(
    () => () => {},
    read,
    () => 1,
  );
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
