import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { complianceGate } from '../src/compliance/gate.ts';
import { openLeadDb } from '../src/leads/index.ts';
import { LeadStore, type NormalizedLead } from '../src/leads/store.ts';
import { updateMatrixCells } from '../src/matrix.ts';
import { runCellStep, runWeeklyReport } from '../src/runner.ts';
import { loadTask, saveTask, applyTransition } from '../src/state/task.ts';
import { categoryFromToolStatus, classifyByRules, classifyReplies, maskText } from '../src/tracker/classify.ts';
import { parseCsv } from '../src/tracker/csv.ts';
import { importEvents, parseCalcomCsv, parseToolCsv } from '../src/tracker/events.ts';
import { fetchCalcomBookings } from '../src/tracker/calcom.ts';
import { unfreezeCampaign, runGuards } from '../src/tracker/guards.ts';
import { simulateEvents } from '../src/tracker/simulate.ts';
import { isoWeek, previousWeek, weekRange } from '../src/tracker/week.ts';
import { FixtureWorker } from '../src/workers/fixture.ts';
import { parse } from 'yaml';
import { makeCtx, makeTempRepo, Clock } from './helpers.ts';
import type { FactoryContext } from '../src/context.ts';

describe('βοηθητικά', () => {
  it('CSV: εισαγωγικά, νέες γραμμές μέσα σε πεδίο, ; ως διαχωριστικό, BOM', () => {
    const rows = parseCsv('\uFEFFemail,reply_text\na@x.example,"Ναι, πείτε μου\nπερισσότερα"\nb@x.example,"Είπε ""όχι"""\n');
    expect(rows).toEqual([
      { email: 'a@x.example', reply_text: 'Ναι, πείτε μου\nπερισσότερα' },
      { email: 'b@x.example', reply_text: 'Είπε "όχι"' },
    ]);
    expect(parseCsv('email;event\na@x.example;sent\n')).toEqual([{ email: 'a@x.example', event: 'sent' }]);
  });

  it('ISO εβδομάδες', () => {
    expect(isoWeek(new Date('2026-10-14T22:00:00Z'))).toBe('2026-W42');
    expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
    const { start, end } = weekRange('2026-W42');
    expect(start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(previousWeek(new Date('2026-10-19T06:00:00Z'))).toBe('2026-W42');
    expect(() => weekRange('2026-W60')).toThrow();
  });
});

describe('κατηγοριοποίηση απαντήσεων', () => {
  it('κανόνες μόνο για διαγραφή και αυτόματη απάντηση· τα υπόλοιπα στο LLM', () => {
    expect(classifyByRules('Παρακαλώ διαγράψτε με από τη λίστα σας')).toBe('unsubscribe');
    expect(classifyByRules('Δεν ενδιαφέρομαι, μη μου ξαναστείλετε')).toBe('unsubscribe');
    expect(classifyByRules('Είμαι εκτός γραφείου έως 20/10')).toBe('ooo');
    expect(classifyByRules('Ναι, πείτε μου περισσότερα')).toBeNull();
    expect(categoryFromToolStatus('not_interested')).toBe('negative');
    expect(categoryFromToolStatus('Interested')).toBe('positive');
    expect(categoryFromToolStatus('')).toBeNull();
    expect(maskText('Πάρτε με στο 6971234567 ή γράψτε στο eleni@salon.example')).toBe('Πάρτε με στο [τηλέφωνο] ή γράψτε στο [email]');
  });

  it('LLM για ό,τι μένει, με κρυμμένα στοιχεία· χωρίς απάντηση → unclassified', async () => {
    const worker = new FixtureWorker('fixture', (input) =>
      input.agent === 'tracker' ? { output: '{"results":[{"id":"r1","category":"positive"},{"id":"r2","category":"κάτι άλλο"}]}' } : null,
    );
    const { ctx } = makeCtx({ worker });
    const out = await classifyReplies(ctx, [
      { id: 'r1', text: 'Ναι, καλέστε με στο 6971234567' },
      { id: 'r2', text: 'Ίσως αργότερα' },
      { id: 'r3', text: 'Αφαιρέστε με' },
    ]);
    expect(out.get('r1')).toBe('positive');
    expect(out.get('r2')).toBe('unclassified');
    expect(out.get('r3')).toBe('unsubscribe');
    expect(worker.calls[0]!.prompt).not.toContain('6971234567');
    expect(worker.calls[0]!.prompt).not.toContain('Αφαιρέστε'); // ό,τι λύθηκε με κανόνα δεν πάει στο LLM
  });
});

// ---------------------------------------------------------------------------------------------

const AT = '2026-10-01T00:00:00.000Z';
function lead(cell: string, vertical: string, i: number): NormalizedLead {
  const domain = `${cell}-${i}.example`;
  return {
    name: `Επιχείρηση ${i}`,
    name_norm: `επιχειρηση ${cell} ${i}`,
    afm: `9${String(i).padStart(3, '0')}${cell.length}0000`.slice(0, 9),
    gemi: null,
    vertical,
    kad: [],
    city: 'Αθήνα',
    address: null,
    website: `https://${domain}`,
    domain,
    phone_e164: null,
    rating: null,
    reviews_count: null,
    signals: {},
    sources: { name: { source: 'places', collected_at: AT } },
    contacts: [{ kind: 'email', value: `info@${domain}`, value_norm: `info@${domain}`, source: 'website' }],
  };
}

/** Καμπάνια email με `n` μέλη που έχουν ήδη βγει σε export. */
async function seedCampaign(store: LeadStore, cell: string, vertical: string, n: number): Promise<{ id: string; emails: string[] }> {
  const id = `${cell}--email_gr--20261005`;
  await store.db.run("insert into campaigns (id, cell_id, channel, status, stats, created_at) values (?, ?, 'email_gr', 'exported', '{}', ?)", [id, cell, AT]);
  const emails: string[] = [];
  for (let i = 0; i < n; i++) {
    const l = lead(cell, vertical, i);
    const { id: bid } = await store.upsert(l);
    const c = (await store.contactsOf(bid))[0]!;
    await store.db.run("insert into campaign_members (campaign_id, business_id, contact_id, status) values (?, ?, ?, 'exported')", [id, bid, c.id]);
    emails.push(l.contacts[0]!.value_norm);
  }
  return { id, emails };
}

/** CSV «σαν από το Instantly»: ακριβώς όσα events ορίζει το σενάριο. */
function toolCsv(campaign: string, emails: string[], s: { bounces: number; opens: number; interested: string[]; notInterested: string[]; replies?: Array<[string, string]>; unsub?: string[]; spam?: string[] }): string {
  const day = '2026-10-13';
  const rows = ['email,event_type,timestamp,campaign,step,bounce_type,lead_status,reply_text'];
  emails.forEach((e, i) => rows.push(`${e},email_sent,${day} 09:${String(i % 60).padStart(2, '0')}:00,${campaign},1,,,`));
  emails.slice(0, s.bounces).forEach((e) => rows.push(`${e},email_bounced,${day} 10:00:00,${campaign},1,hard,,`));
  emails.slice(s.bounces, s.bounces + s.opens).forEach((e) => rows.push(`${e},email_opened,${day} 11:00:00,${campaign},1,,,`));
  for (const e of s.interested) rows.push(`${e},reply_received,${day} 12:00:00,${campaign},1,,interested,"Ναι, στείλτε μου"`);
  for (const e of s.notInterested) rows.push(`${e},reply_received,${day} 12:00:00,${campaign},1,,not_interested,Όχι ευχαριστώ`);
  for (const [e, text] of s.replies ?? []) rows.push(`${e},reply_received,${day} 12:30:00,${campaign},1,,,"${text}"`);
  for (const e of s.unsub ?? []) rows.push(`${e},lead_unsubscribed,${day} 13:00:00,${campaign},1,,,`);
  for (const e of s.spam ?? []) rows.push(`${e},spam_complaint,${day} 14:00:00,${campaign},1,,,`);
  return rows.join('\n') + '\n';
}

function matrixPriorities(ctx: FactoryContext): Record<string, number> {
  const doc = parse(fs.readFileSync(path.join(ctx.ps.stateRoot, 'config', 'matrix.yaml'), 'utf8')) as { cells: Array<{ id: string; priority: number }> };
  return Object.fromEntries(doc.cells.map((c) => [c.id, c.priority]));
}

describe('Φάση 7: tracker με fixture events', () => {
  it('μετρικές, πάγωμα, suppression, αλλαγές priority και εβδομαδιαία αναφορά', async () => {
    const repo = makeTempRepo();
    const clock = new Clock(new Date('2026-10-14T22:00:00Z'));
    // Γνωστά priorities, ώστε οι αλλαγές να μη «χτυπούν» το 100.
    const base = makeCtx({ repo, clock });
    const cells = base.ctx.config.matrix.cells;
    const A = 'kommotiria-booking';
    const B = 'iatreia-support';
    const C = 'xenodocheia-sales';
    const siblingA = cells.find((c) => c.vertical === 'kommotiria' && c.id !== A)!.id;
    const siblingC = cells.find((c) => c.vertical === 'xenodocheia' && c.id !== C)!.id;
    const otherVertical = cells.find((c) => !['kommotiria', 'iatreia', 'xenodocheia'].includes(c.vertical))!.id;
    updateMatrixCells(base.ctx.ps, { [A]: { priority: 50 }, [B]: { priority: 60 }, [C]: { priority: 40 }, [siblingA]: { priority: 30 }, [siblingC]: { priority: 30 }, [otherVertical]: { priority: 30 } });

    const { ctx } = makeCtx({ repo, clock, worker: new FixtureWorker() });
    let db = await openLeadDb(ctx);
    let store = new LeadStore(db, ctx.now);
    const a = await seedCampaign(store, A, 'kommotiria', 300);
    const b = await seedCampaign(store, B, 'iatreia', 250);
    const c = await seedCampaign(store, C, 'xenodocheia', 120);

    // A: 2% bounce, 8 θετικές, 4 αρνητικές, 1 εκτός γραφείου, 2 διαγραφές (μία με απάντηση), 3 κρατήσεις.
    const csvA = toolCsv(a.id, a.emails, {
      bounces: 6,
      opens: 90,
      interested: a.emails.slice(100, 108),
      notInterested: a.emails.slice(110, 114),
      replies: [
        [a.emails[120]!, 'Είμαι εκτός γραφείου έως 20/10'],
        [a.emails[121]!, 'Παρακαλώ διαγράψτε με'],
      ],
      unsub: [a.emails[122]!],
    });
    // B: 6% bounce και 1 spam complaint, καμία θετική απάντηση.
    const csvB = toolCsv(b.id, b.emails, { bounces: 15, opens: 40, interested: [], notInterested: b.emails.slice(50, 53), spam: [b.emails[60]!] });
    // C: λίγες επαφές, τίποτα θετικό από email· ένα pilot καταγράφει ο άνθρωπος.
    const csvC = toolCsv(c.id, c.emails, { bounces: 1, opens: 30, interested: [], notInterested: [] });
    const cal = ['uid,attendee_email,created_at,status', `u1,${a.emails[100]},2026-10-14 10:00,accepted`, `u2,${a.emails[101]},2026-10-14 11:00,accepted`, `u3,${a.emails[102]},2026-10-15 09:00,accepted`, `u4,${a.emails[103]},2026-10-15 09:30,cancelled`, 'u5,stranger@elsewhere.example,2026-10-15 10:00,accepted'].join('\n');

    const parsedA = parseToolCsv(csvA, 'instantly');
    const s1 = await importEvents(ctx, store, parsedA.events);
    expect(s1.imported).toBe(300 + 6 + 90 + 8 + 4 + 2 + 1);
    expect(s1.byType).toMatchObject({ sent: 300, bounce: 6, open: 90, reply_positive: 8, reply_negative: 4, reply_other: 1, unsubscribe: 2 });
    // Idempotent: το ίδιο αρχείο ξανά δεν διπλασιάζει τίποτα.
    const again = await importEvents(ctx, store, parseToolCsv(csvA, 'instantly').events);
    expect(again.imported).toBe(0);
    expect(again.duplicates).toBe(s1.imported);

    await importEvents(ctx, store, parseToolCsv(csvB, 'smartlead').events);
    await importEvents(ctx, store, parseToolCsv(csvC, 'lemlist').events);
    const calParsed = parseCalcomCsv(cal);
    expect(calParsed.ignored).toBe(1); // ακυρωμένη
    const sCal = await importEvents(ctx, store, calParsed.events);
    expect(sCal.imported).toBe(3);
    expect(sCal.unmatched).toBe(1);

    // Suppression αμέσως: διαγραφές (email + domain), spam (email + domain), hard bounces (email).
    expect(await store.suppressedReason({ emails: [a.emails[121]!] })).toMatch(/διαγραφής/);
    expect(await store.suppressedReason({ emails: [a.emails[122]!] })).toMatch(/διαγραφής/);
    expect(await store.suppressedReason({ domain: b.emails[60]!.split('@')[1] })).toMatch(/spam/);
    expect(await store.suppressedReason({ emails: [a.emails[0]!] })).toMatch(/hard bounce/);
    expect(await store.suppressedReason({ emails: [a.emails[200]!] })).toBeNull();
    // Το κείμενο των απαντήσεων και τα emails δεν αποθηκεύονται στα events.
    const metas = await db.all<{ meta: string }>('select meta from events');
    expect(metas.some((m) => /@|διαγράψτε|εκτός/.test(String(m.meta)))).toBe(false);
    await db.close();

    // Ο άνθρωπος καταγράφει ένα pilot για το C (το CLI `record` καλεί το ίδιο).
    db = await openLeadDb(ctx);
    store = new LeadStore(db, ctx.now);
    await importEvents(ctx, store, [{ key: 'pilot-1', source: 'manual', kind: 'pilot', occurredAt: '2026-10-15T12:00:00.000Z', cellId: C }]);
    await db.close();

    // Εβδομαδιαία αναφορά.
    const r = await runWeeklyReport(ctx, '2026-W42');
    expect(r.frozen.map((f) => f.campaignId)).toEqual([b.id]);
    expect(r.frozen[0]!.reasons.join(' ')).toMatch(/bounce 6\.0%/);
    expect(r.frozen[0]!.reasons.join(' ')).toMatch(/spam/);
    expect(fs.readFileSync(path.join(ctx.ps.stateRoot, 'reports', 'gates-dry-run.log'), 'utf8')).toContain(`[ALERT] Πάγωμα καμπάνιας ${b.id}`);

    const changes = Object.fromEntries(r.changes.map((x) => [x.cellId, x]));
    // A: 3 κλήσεις × 5 + 8 θετικές × 2 = 31 → κόβεται στο +15.
    expect(changes[A]).toMatchObject({ from: 50, to: 65, delta: 15 });
    expect(changes[A]!.reasons.join(' ')).toMatch(/όριο ±15/);
    // B: 250 επαφές, καμία θετική → -10.
    expect(changes[B]).toMatchObject({ from: 60, to: 50, delta: -10 });
    // C: 1 pilot → +10. 120 επαφές < 200: δεν κρίνεται ακόμα για «καμία απόκριση».
    expect(changes[C]).toMatchObject({ from: 40, to: 50, delta: 10 });
    // Ο κλάδος του A έφερε 3 κλήσεις → τα άλλα κελιά του κλάδου +6. Του C: 1 pilot → +2.
    expect(changes[siblingA]).toMatchObject({ from: 30, to: 36 });
    expect(changes[siblingC]).toMatchObject({ from: 30, to: 32 });
    expect(changes[otherVertical]).toBeUndefined();
    const prio = matrixPriorities(ctx);
    expect([prio[A], prio[B], prio[C], prio[siblingA], prio[otherVertical]]).toEqual([65, 50, 50, 36, 30]);

    const report = fs.readFileSync(r.file, 'utf8');
    expect(path.basename(r.file)).toBe('2026-W42.md');
    expect(report).toContain(`| ${A} | email_gr | 300 | 2.0% | 30% | 8 | 4 | 1 | 2 | 0 | 3 | 0 |`);
    expect(report).toContain(`| ${B} | email_gr | 250 | 6.0% | 16% | 0 | 3 | 0 | 0 | 1 | 0 | 0 |`);
    expect(report).toContain(`| ${C} | άλλο | 0 |`);
    expect(report).toMatch(new RegExp(`\`${b.id}\` \\(πάγωσε τώρα: bounce 6\\.0%`));
    expect(report).toContain(`| ${A} | 50 | 65 |`);
    expect(report).toContain('Καλά: Κομμωτήρια');
    expect(report).not.toMatch(/@/); // μόνο αθροίσματα
    expect(report).not.toContain('Πολύ λίγα δεδομένα'); // 670 επαφές

    // Ξανατρέχει την ίδια εβδομάδα: καμία διπλή αλλαγή.
    const r2 = await runWeeklyReport(ctx, '2026-W42');
    expect(r2.frozen).toEqual([]);
    expect(matrixPriorities(ctx)[A]).toBe(65);
    expect(matrixPriorities(ctx)[B]).toBe(50);

    // Η παγωμένη καμπάνια δεν βγάζει export· ξεπαγώνει μόνο άνθρωπος και τα όρια μετρούν από εκεί.
    db = await openLeadDb(ctx);
    store = new LeadStore(db, ctx.now);
    const gate = await complianceGate({ ps: ctx.ps, config: ctx.config, channel: 'email_gr', campaignStatus: 'frozen', now: ctx.now() });
    expect(gate.reasons.join(' ')).toMatch(/παγώσει/);
    await expect(unfreezeCampaign(store, b.id, '', ctx.now())).rejects.toThrow(/--by/);
    expect(await unfreezeCampaign(store, b.id, 'Χρήστος', ctx.now())).toBe('exported');
    expect(await runGuards(ctx, store)).toEqual([]);
    await db.close();
  });

  it('λίγα δεδομένα: το λέει η αναφορά και κανένα κελί δεν πέφτει', async () => {
    const { ctx } = makeCtx({ worker: new FixtureWorker() });
    const db = await openLeadDb(ctx);
    const store = new LeadStore(db, ctx.now);
    const a = await seedCampaign(store, 'kommotiria-booking', 'kommotiria', 30);
    await importEvents(ctx, store, parseToolCsv(toolCsv(a.id, a.emails, { bounces: 0, opens: 5, interested: [], notInterested: [] }), 'instantly').events);
    await db.close();
    const r = await runWeeklyReport(ctx, '2026-W42');
    expect(r.tooLittleData).toBe(true);
    expect(r.changes).toEqual([]);
    expect(fs.readFileSync(r.file, 'utf8')).toContain('Πολύ λίγα δεδομένα για συμπέρασμα');
  });

  it('λίστα κλήσεων που βγήκε σε export δεν ρίχνει το κελί για «καμία απόκριση» (D048)', async () => {
    const { ctx } = makeCtx({ worker: new FixtureWorker() });
    const db = await openLeadDb(ctx);
    const store = new LeadStore(db, ctx.now);
    const a = await seedCampaign(store, 'iatreia-support', 'iatreia', 300);
    await db.run("update campaigns set channel = 'phone_b2b' where id = ?", [a.id]);
    await db.close();
    const r = await runWeeklyReport(ctx, '2026-W42');
    expect(r.changes).toEqual([]);
    expect(fs.readFileSync(r.file, 'utf8')).toContain('| iatreia-support | phone_b2b | 300 |');
  });

  it('το guard δεν κρίνει πριν από min_sent_before_freeze αποστολές', async () => {
    const { ctx } = makeCtx({ worker: new FixtureWorker() });
    const db = await openLeadDb(ctx);
    const store = new LeadStore(db, ctx.now);
    const a = await seedCampaign(store, 'kommotiria-booking', 'kommotiria', 20);
    await importEvents(ctx, store, parseToolCsv(toolCsv(a.id, a.emails, { bounces: 5, opens: 0, interested: [], notInterested: [] }), 'instantly').events);
    expect(await runGuards(ctx, store)).toEqual([]); // 25% bounce, αλλά μόνο 20 αποστολές
    await db.close();
  });

  it('βήμα track: μένει σε tracking, κλείνει μετά από 30 ήσυχες ημέρες χωρίς μέλη για export', async () => {
    const clock = new Clock(new Date('2026-10-14T22:00:00Z'));
    const { ctx } = makeCtx({ clock, worker: new FixtureWorker() });
    const cell = ctx.config.matrix.cells.find((c) => c.id === 'kommotiria-booking')!;
    const task = loadTask(ctx.ps, cell, ctx.now());
    task.state = 'campaign_approved';
    applyTransition(task, 'exported', { kind: 'system', name: 'orchestrator' }, ctx.now());
    saveTask(ctx.ps, task);
    const db = await openLeadDb(ctx);
    await seedCampaign(new LeadStore(db, ctx.now), cell.id, 'kommotiria', 3);
    await db.close();

    const r1 = await runCellStep(ctx, cell.id, 'track');
    expect(r1.steps[0]).toMatchObject({ ok: true, stayed: true, to: 'tracking' });
    clock.advance(31 * 86_400_000);
    const r2 = await runCellStep(ctx, cell.id, 'track');
    expect(r2.steps[0]).toMatchObject({ ok: true, to: 'done' });
  });

  it('Cal.com API: σελίδες, ακυρωμένες εκτός, utm_campaign ως καμπάνια', async () => {
    const calls: string[] = [];
    const page = (n: number, offset: number) =>
      Array.from({ length: n }, (_, i) => ({ uid: `b${offset + i}`, status: i === 0 ? 'cancelled' : 'accepted', createdAt: '2026-10-14T10:00:00Z', attendees: [{ email: `X${offset + i}@Shop.example` }], metadata: i === 1 ? { utm_campaign: 'kommotiria-booking--email_gr--20261005' } : {} }));
    const http = async (url: string, req?: { headers?: Record<string, string> }) => {
      calls.push(url);
      expect(req?.headers?.authorization).toBe('Bearer k');
      const skip = Number(new URL(url).searchParams.get('skip'));
      return { status: 200, headers: {}, body: JSON.stringify({ status: 'success', data: skip === 0 ? page(100, 0) : page(5, 100) }) };
    };
    const ev = await fetchCalcomBookings(http, 'k', new Date('2026-10-01'));
    expect(calls).toHaveLength(2);
    expect(ev).toHaveLength(99 + 4);
    expect(ev[0]).toMatchObject({ key: 'b1', kind: 'call_booked', email: 'x1@shop.example', campaignId: 'kommotiria-booking--email_gr--20261005' });
    const denied = async () => ({ status: 401, headers: {}, body: '' });
    await expect(fetchCalcomBookings(denied, 'k', new Date())).rejects.toThrow(/CAL_API_KEY/);
  });

  it('dry-run προσομοίωση: ίδια διαδρομή με τα πραγματικά αρχεία', async () => {
    const { ctx } = makeCtx({ worker: new FixtureWorker() });
    const db = await openLeadDb(ctx);
    const store = new LeadStore(db, ctx.now);
    const a = await seedCampaign(store, 'kommotiria-booking', 'kommotiria', 400);
    const sim = await simulateEvents(store, a.id, new Date('2026-10-13T08:00:00Z'));
    const t = parseToolCsv(sim.toolCsv, 'instantly');
    const s = await importEvents(ctx, store, [...t.events, ...parseCalcomCsv(sim.calcomCsv).events]);
    expect(t.ignored).toBe(0);
    expect(s.byType.sent).toBe(400);
    expect(s.unmatched).toBe(0);
    // Ίδιο seed → ίδια events.
    expect((await simulateEvents(store, a.id, new Date('2026-10-13T08:00:00Z'))).toolCsv).toBe(sim.toolCsv);
    await db.close();
  });
});
