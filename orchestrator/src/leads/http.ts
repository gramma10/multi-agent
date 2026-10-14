/** Ελάχιστος HTTP client, injectable: σε fixture mode τον αντικαθιστά ο FakeWorld. */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface HttpRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export type HttpClient = (url: string, req?: HttpRequest) => Promise<HttpResponse>;

export const fetchHttp: HttpClient = async (url, req = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 15_000);
  try {
    const r = await fetch(url, { method: req.method ?? 'GET', headers: req.headers, body: req.body, signal: ctrl.signal, redirect: 'follow' });
    const buf = await r.arrayBuffer();
    const max = req.maxBytes ?? 5_000_000;
    const body = new TextDecoder().decode(buf.byteLength > max ? buf.slice(0, max) : buf);
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => (headers[k] = v));
    return { status: r.status, headers, body };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Rate limiter ανά κλειδί (πηγή ή domain): το πολύ `perMinute` αιτήματα το λεπτό.
 * Το sleep είναι injectable ώστε τα tests/fixtures να μην περιμένουν πραγματικά.
 */
export class RateLimiter {
  private last = new Map<string, number>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async wait(key: string, perMinute: number): Promise<void> {
    const gap = 60_000 / perMinute;
    const prev = this.last.get(key);
    const t = this.now();
    if (prev !== undefined && t - prev < gap) {
      await this.sleep(gap - (t - prev));
    }
    this.last.set(key, Math.max(this.now(), (prev ?? 0) + gap));
  }
}

export class QuotaError extends Error {
  constructor(source: string, detail: string) {
    super(`${source}: όριο/quota (${detail}). Συνεχίζει στην επόμενη εκτέλεση από το ίδιο σημείο.`);
    this.name = 'QuotaError';
  }
}
