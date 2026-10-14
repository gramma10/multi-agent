import fs from 'node:fs';
import path from 'node:path';
import type { Worker, WorkerRunInput, WorkerRunResult } from './types.ts';

/**
 * Worker για outputs που έχουν ήδη γραφτεί από άνθρωπο ή από μια διαδραστική session
 * (π.χ. τα πρώτα 3 demos στη session εγκατάστασης). Δεν γράφει τίποτα: ελέγχει ότι τα
 * αναμενόμενα αρχεία υπάρχουν, και ο orchestrator τρέχει κανονικά όλους τους υπόλοιπους
 * ελέγχους (μορφή, scope, tests) και τις μεταβάσεις. Φαίνεται στο ιστορικό ως worker «prepared».
 *
 * Χρησιμοποιείται ΜΟΝΟ ρητά: `factory -- cell <id> <βήμα> --worker prepared`.
 */
export class PreparedWorker implements Worker {
  readonly name = 'prepared';

  async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    const missing = (input.outputs ?? []).filter((o) => !fs.existsSync(path.join(input.cwd, o)));
    if (missing.length) {
      return {
        output: '',
        usage: null,
        exitReason: 'error',
        durationMs: 0,
        errorMessage: `prepared: λείπουν αρχεία που έπρεπε να έχουν γραφτεί: ${missing.join(', ')}`,
      };
    }
    return { output: 'prepared: τα αρχεία υπήρχαν ήδη', usage: null, exitReason: 'ok', durationMs: 0 };
  }
}
