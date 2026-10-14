#!/usr/bin/env node
// Μπλοκάρει commits που φέρνουν δεδομένα leads στο git (CLAUDE.md κανόνας 4).
//
//   node scripts/check-personal-data.mjs            → ελέγχει τα staged αρχεία (pre-commit)
//   node scripts/check-personal-data.mjs --all      → ελέγχει όλα τα αρχεία του repo (CI)
//
// Κανόνες:
//   1. Αρχεία δεδομένων (csv, tsv, xlsx, xls, ods, sqlite, db, ndjson, dump/sql εκτός migrations) με
//      email ή ελληνικό τηλέφωνο → μπλοκάρονται.
//   2. Οποιοδήποτε κείμενο με 5+ διαφορετικά πραγματικά emails ή 5+ ελληνικά τηλέφωνα → μπλοκάρεται.
//   Επιτρέπονται: @example.com/.example/.test, τα 210 000 xxxx των demos, και αρχεία στη λίστα ALLOW.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ALL = process.argv.includes('--all');
const ALLOW = [/^supabase\/migrations\//, /package-lock\.json$/, /^CLOUD_SESSION_PROMPT\.md$/, /^scripts\/check-personal-data\.mjs$/, /(^|\/)node_modules\//];
const DATA_EXT = /\.(csv|tsv|xlsx|xls|ods|sqlite3?|db|ndjson|dump|sql)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const PHONE = /(?:\+30[\s-]?|0030[\s-]?)?\b(2\d{2}[\s-]?\d{3}[\s-]?\d{4}|69\d[\s-]?\d{3}[\s-]?\d{4})\b/g;

const isFakeEmail = (e) => /@(example\.(com|org|net)|[^@]*\.example|[^@]*\.test|anthropic\.com)$/i.test(e) || /noreply/i.test(e);
const isFakePhone = (p) => /^2\d0[\s-]?000/.test(p.replace(/\D/g, '').replace(/^(30|0030)/, '')) || /^2100\d{6}$/.test(p.replace(/\D/g, '').replace(/^30/, ''));

function files() {
  const out = execFileSync('git', ALL ? ['ls-files'] : ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function read(f) {
  if (ALL) return fs.existsSync(f) ? fs.readFileSync(f) : null;
  try {
    return execFileSync('git', ['show', `:${f}`], { maxBuffer: 50 * 1024 * 1024 });
  } catch {
    return null;
  }
}

const problems = [];
for (const f of files()) {
  if (ALLOW.some((re) => re.test(f))) continue;
  const buf = read(f);
  if (!buf) continue;
  if (/\.(sqlite3?|db|xlsx|xls|ods)$/i.test(f)) {
    problems.push(`${f}: αρχείο βάσης/λογιστικού φύλλου δεν μπαίνει ποτέ στο git`);
    continue;
  }
  if (buf.includes(0)) continue; // binary
  const text = buf.toString('utf8');
  const emails = new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase()).filter((e) => !isFakeEmail(e)));
  const phones = new Set((text.match(PHONE) ?? []).map((p) => p.replace(/\D/g, '')).filter((p) => !isFakePhone(p)));
  if (DATA_EXT.test(path.basename(f)) && (emails.size || phones.size)) {
    problems.push(`${f}: αρχείο δεδομένων με ${emails.size} emails και ${phones.size} τηλέφωνα`);
  } else if (emails.size >= 5 || phones.size >= 5) {
    problems.push(`${f}: ${emails.size} emails και ${phones.size} τηλέφωνα (μοιάζει με λίστα επαφών)`);
  }
}

if (problems.length) {
  console.error('✗ Βρέθηκαν πιθανά προσωπικά δεδομένα. Τα leads ζουν μόνο στη βάση, ποτέ στο git:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nΑν είναι false positive, πρόσθεσε το αρχείο στη λίστα ALLOW του scripts/check-personal-data.mjs (με λόγο στο commit).');
  process.exit(1);
}
console.log(`✓ Κανένα προσωπικό δεδομένο σε ${ALL ? 'όλο το repo' : 'όσα είναι staged'}.`);
