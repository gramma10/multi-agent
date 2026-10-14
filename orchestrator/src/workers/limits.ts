import type { ExitReason } from './types.ts';

/**
 * Αναγνώριση μηνυμάτων ορίου χρήσης ανά CLI. Τα μηνύματα αλλάζουν από έκδοση σε έκδοση,
 * γι' αυτό τα patterns είναι χαλαρά και τα tests καλύπτουν τις γνωστές μορφές.
 */
interface LimitPatterns {
  usage: RegExp[];
  rate: RegExp[];
}

const COMMON_RATE = [/\brate[ _-]?limit/i, /\b429\b/, /too many requests/i];

export const LIMIT_PATTERNS: Record<string, LimitPatterns> = {
  claude: {
    usage: [
      /usage limit reached/i,
      /you(?:'|’)ve (?:hit|reached) your (?:usage |session |weekly )?limit/i,
      /\blimit reached\b.*\breset/i,
      /(?:5-hour|weekly|session) limit/i,
      /out of (?:extra )?usage/i,
    ],
    rate: COMMON_RATE,
  },
  codex: {
    usage: [/usage limit/i, /you(?:'|’)ve hit your usage limit/i, /quota exceeded/i, /insufficient_quota/i],
    rate: COMMON_RATE,
  },
  gemini: {
    usage: [/quota exceeded/i, /RESOURCE_EXHAUSTED/, /daily (?:request )?limit/i, /usage limit/i],
    rate: COMMON_RATE,
  },
};

export function detectLimit(worker: string, text: string): ExitReason | null {
  const pats = LIMIT_PATTERNS[worker] ?? { usage: [/usage limit/i, /quota/i], rate: COMMON_RATE };
  if (pats.usage.some((re) => re.test(text))) return 'usage_limit';
  if (pats.rate.some((re) => re.test(text))) return 'rate_limit';
  return null;
}

/**
 * Προσπαθεί να βρει πότε ξαναρχίζει ο worker από το μήνυμα:
 *   - `...limit reached|1767225600` (epoch seconds, παλιά μορφή Claude)
 *   - ISO timestamp
 *   - `try again in 2 hours` / `in 37 minutes`
 * Αν δεν βρει, επιστρέφει null και ο caller βάζει το default cooldown.
 */
export function parseResetAt(text: string, now: Date): Date | null {
  const epoch = /\|\s*(\d{10})\b/.exec(text);
  if (epoch) return new Date(Number(epoch[1]) * 1000);

  const iso = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/.exec(text);
  if (iso) {
    const d = new Date(iso[1]!);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const rel = /in\s+(\d+)\s*(second|sec|minute|min|hour|hr|h|day)s?\b/i.exec(text);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2]!.toLowerCase();
    const ms =
      unit.startsWith('s') ? n * 1000 : unit.startsWith('m') ? n * 60_000 : unit.startsWith('d') ? n * 86_400_000 : n * 3_600_000;
    return new Date(now.getTime() + ms);
  }
  return null;
}
