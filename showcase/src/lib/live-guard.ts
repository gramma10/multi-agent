/**
 * Όρια για το Live AI των demos: rate limit ανά IP και όριο κόστους ανά ημέρα.
 *
 * Κρατιούνται στη μνήμη της διεργασίας. Σε serverless (Vercel) κάθε instance έχει δικό του
 * μετρητή, οπότε το πραγματικό όριο μπορεί να είναι λίγο πιο χαλαρό. Για αυστηρό όριο: Supabase
 * ή KV (βλ. DECISIONS.md). Αν δεν οριστούν τα env, το Live AI είναι κλειστό.
 */

export interface LiveLimits {
  perIpMax: number;
  perIpWindowMs: number;
  dailyBudgetUsd: number;
  priceInPerMTok: number;
  priceOutPerMTok: number;
}

export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): LiveLimits {
  const num = (k: string, d: number) => {
    const v = Number(env[k]);
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    perIpMax: num('LIVE_PER_IP_MAX', 8),
    perIpWindowMs: num('LIVE_PER_IP_WINDOW_MIN', 10) * 60_000,
    dailyBudgetUsd: num('LIVE_DAILY_BUDGET_USD', 1),
    // Συντηρητικές προεπιλογές· βάλε τις τιμές του μοντέλου που χρησιμοποιείς.
    priceInPerMTok: num('LIVE_PRICE_IN_PER_MTOK', 5),
    priceOutPerMTok: num('LIVE_PRICE_OUT_PER_MTOK', 25),
  };
}

export class LiveGuard {
  private hits = new Map<string, number[]>();
  private day = '';
  private spentUsd = 0;

  constructor(
    private readonly limits: LiveLimits,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private rollDay(): void {
    const d = new Date(this.now()).toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.spentUsd = 0;
    }
  }

  /** null = επιτρέπεται. Αλλιώς ο λόγος άρνησης. */
  check(ip: string): 'rate_limited' | 'budget_exhausted' | null {
    this.rollDay();
    if (this.spentUsd >= this.limits.dailyBudgetUsd) return 'budget_exhausted';
    const t = this.now();
    const recent = (this.hits.get(ip) ?? []).filter((x) => t - x < this.limits.perIpWindowMs);
    if (recent.length >= this.limits.perIpMax) {
      this.hits.set(ip, recent);
      return 'rate_limited';
    }
    recent.push(t);
    this.hits.set(ip, recent);
    // Για να μη μεγαλώνει ο χάρτης επ' άπειρον.
    if (this.hits.size > 10_000) this.hits.clear();
    return null;
  }

  record(inputTokens: number, outputTokens: number): number {
    this.rollDay();
    const cost = (inputTokens * this.limits.priceInPerMTok + outputTokens * this.limits.priceOutPerMTok) / 1_000_000;
    this.spentUsd += cost;
    return cost;
  }

  get spent(): number {
    this.rollDay();
    return this.spentUsd;
  }
}
