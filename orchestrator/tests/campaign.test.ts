import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCampaigns } from '../src/campaigns/build.ts';
import { exportCampaign } from '../src/campaigns/export.ts';
import { maskName, runCampaignQa, sampleOf, writeQaReports } from '../src/campaigns/qa-run.ts';
import { evalCondition, renderCall, renderDraft, renderEmail, senderBlock, type LeadView, type RenderContext } from '../src/campaigns/render.ts';
import { loadTemplates } from '../src/campaigns/template.ts';
import { checkSendingDomains } from '../src/compliance/dns.ts';
import { complianceGate, emailDailyLimit } from '../src/compliance/gate.ts';
import { parseLegalStatus } from '../src/compliance/legal-status.ts';
import { openSqlite } from '../src/leads/db.ts';
import { FakeWorld } from '../src/leads/fake-world.ts';
import { RateLimiter } from '../src/leads/http.ts';
import { runLeadSourcing } from '../src/leads/pipeline.ts';
import { GemiSource, PlacesSource } from '../src/leads/sources.ts';
import { LeadStore, type BusinessRow } from '../src/leads/store.ts';
import { loadLeadsConfig } from '../src/leads/types.ts';
import { WebsiteEnricher } from '../src/leads/website.ts';
import { FixtureWorker } from '../src/workers/fixture.ts';
import { loadBannedPhrases } from '../src/qa/brand.ts';
import { checkMessage } from '../src/qa/messages.ts';
import { makeCtx, REAL_REPO } from './helpers.ts';

const AT = '2026-10-01T00:00:00.000Z';
const src = (s: 'gemi' | 'places' | 'website') => ({ source: s, collected_at: AT });

function biz(over: Partial<BusinessRow> = {}): BusinessRow {
  return {
    id: 'b1',
    afm: null,
    gemi: null,
    name: 'Κομμωτήριο Ελένη',
    name_norm: 'κομμωτηριο ελενη',
    vertical: 'kommotiria',
    kad: [],
    city: 'Αθήνα',
    address: null,
    website: 'https://eleni.example',
    domain: 'eleni.example',
    phone_e164: null,
    rating: 4.7,
    reviews_count: 85,
    signals: { has_online_booking: false, has_chat: false },
    sources: { name: src('places'), city: src('places'), rating: src('places'), reviews_count: src('places'), signals: src('website') },
    ...over,
  };
}
const view = (b: BusinessRow): LeadView => ({ businessId: b.id, contactId: 'c1', email: `info@${b.domain}`, phone: null, formUrl: null, business: b });

const rc: RenderContext = {
  campaignId: 'kommotiria-booking--email_gr--20261014',
  cellId: 'kommotiria-booking',
  channel: 'email_gr',
  siteUrl: 'https://demos.example',
  sender: { company: 'Auragram', people: ['Χρήστος', 'Παναγιώτης'], website: 'https://auragram.example', address: 'Αθήνα', unsubscribe_url: 'https://auragram.example/u', booking_url: 'https://cal.example/xartis', demo_base_url: 'https://demos.example' },
  verticalName: 'Κομμωτήρια και κουρεία',
  serviceName: 'Σύστημα κρατήσεων',
};

const fixtureTemplates = () => loadTemplates(path.join(REAL_REPO, 'orchestrator', 'fixtures', 'outreach'));

describe('προσωποποίηση μόνο από πεδία με πηγή', () => {
  it('συνθήκες: ισχύουν μόνο αν το πεδίο έχει πηγή', () => {
    const b = biz();
    expect(evalCondition('signals.has_online_booking == false', view(b))).toBe(true);
    expect(evalCondition('business.reviews_count >= 50 && signals.has_chat == false', view(b))).toBe(true);
    expect(evalCondition('signals.has_online_booking == false', view(biz({ sources: {} })))).toBe(false); // χωρίς πηγή
    expect(evalCondition('business.unknown == 1', view(b))).toBe(false);
  });

  it('variant με όνομα μόνο όταν το όνομα έχει πηγή και δεν είναι επωνυμία σε κεφαλαία', () => {
    const { templates } = fixtureTemplates();
    const withName = renderEmail(templates.email!, rc, view(biz()))[0]!;
    expect(withName.text).toContain('στο Κομμωτήριο Ελένη τα ραντεβού κλείνουν μόνο τηλεφωνικά');
    expect(withName.usedFields).toEqual(['business.name']);

    const caps = renderEmail(templates.email!, rc, view(biz({ name: 'ΚΟΜΜΩΤΗΡΙΟ ΕΛΕΝΗ Ι.Κ.Ε.' })))[0]!;
    expect(caps.text).not.toContain('ΚΟΜΜΩΤΗΡΙΟ');
    expect(caps.text).toContain('Γράφω σε επιχειρήσεις του κλάδου');

    const noSignals = renderEmail(templates.email!, rc, view(biz({ sources: { name: src('places') } })))[0]!;
    expect(noSignals.textId).toBe('email_gr-d0-v1'); // default
    expect(noSignals.unsourced).toEqual([]);
  });

  it('κάθε email έχει link demo με UTM, CTA, στοιχεία αποστολέα και προσωπικό link διαγραφής', () => {
    const { templates } = fixtureTemplates();
    const msgs = renderEmail(templates.email!, rc, view(biz()));
    expect(msgs).toHaveLength(3);
    for (const m of msgs) {
      expect(m.body).toContain('https://demos.example/demos/kommotiria-booking?utm_source=email_gr');
      expect(m.body).toContain('https://cal.example/xartis');
      expect(m.body).toContain('Χρήστος & Παναγιώτης · Auragram');
      expect(m.body).toMatch(/https:\/\/auragram\.example\/u\?t=[0-9a-f]{16}/);
    }
  });
});

describe('deterministic QA (Q1–Q10)', () => {
  const banned = loadBannedPhrases(REAL_REPO);
  const ctx = { banned, otherVerticalTerms: ['ιατρείο', 'ξενοδοχείο'] };
  const base = () => renderEmail(fixtureTemplates().templates.email!, rc, view(biz()))[0]!;
  const rules = (m: ReturnType<typeof base>) => [...new Set(checkMessage(m, ctx).map((f) => f.rule))].sort();

  it('το fixture περνά', () => {
    expect(checkMessage(base(), ctx)).toEqual([]);
  });

  it.each([
    ['Q1+Q9', (m: ReturnType<typeof base>) => ({ ...m, unsourced: ['business.owner'], text: m.text + ' {{business.owner}}', body: m.body + ' {{business.owner}}' }), ['Q1', 'Q9']],
    ['Q2', (m: ReturnType<typeof base>) => ({ ...m, text: m.text + '\nΟι πελάτες μας κλείνουν 40% περισσότερα ραντεβού.' }), ['Q2']],
    ['Q3', (m: ReturnType<typeof base>) => ({ ...m, text: m.text.replace('Κομμωτήριο Ελένη', 'Κομμωτήριο Άλλο') + ' Για το ιατρείο σου.' }), ['Q3']],
    ['Q4', (m: ReturnType<typeof base>) => ({ ...m, text: m.text + ' Το κoμμωτήριο σου.' }), ['Q4']],
    ['Q5', (m: ReturnType<typeof base>) => ({ ...m, subject: 'Ένα πολύ μεγάλο θέμα που ξεπερνά με άνεση τους εξήντα χαρακτήρες του ορίου' }), ['Q5']],
    ['Q6', (m: ReturnType<typeof base>) => ({ ...m, text: m.text + ' ΜΟΝΟ ΣΗΜΕΡΑ!!! Κέρδισε 100%' }), ['Q2', 'Q6']],
    ['Q7', (m: ReturnType<typeof base>) => ({ ...m, body: m.body.replace(m.parts.unsubscribe, '').replace(m.parts.sender, '') }), ['Q7']],
    ['Q8', (m: ReturnType<typeof base>) => ({ ...m, text: m.text.replace(/Χάρτη AI/g, 'κλήση').split(m.parts.demoUrl.split('?')[0]!).join('') }), ['Q8']],
    ['Q10', (m: ReturnType<typeof base>) => ({ ...m, text: m.text + ' Είναι πραγματικό game-changer.' }), ['Q10']],
  ] as const)('%s', (_n, mutate, expected) => {
    expect(rules(mutate(base()) as ReturnType<typeof base>)).toEqual([...expected].sort());
  });
});

describe('compliance', () => {
  it('LEGAL_STATUS: approved μόνο με ημερομηνία ΚΑΙ όνομα', () => {
    const md = [
      '| Κανάλι (id) | Status | Ημερομηνία | Εγκρίθηκε από | Βάση |',
      '|---|---|---|---|---|',
      '| inbound | approved | 2026-10-14 | Brief | x |',
      '| email_gr | approved | | | χωρίς υπογραφή |',
      '| email_intl | approved | 2026-11-01 | Δικηγόρος Χ | ok |',
      '| social_dm | blocked | | | |',
    ].join('\n');
    const rows = parseLegalStatus(md);
    expect(rows.get('inbound')?.status).toBe('approved');
    expect(rows.get('email_gr')?.status).toBe('pending');
    expect(rows.get('email_intl')?.status).toBe('approved');
    expect(rows.get('social_dm')?.status).toBe('blocked');
    // Το πραγματικό αρχείο: μόνο το inbound
    const real = parseLegalStatus(fs.readFileSync(path.join(REAL_REPO, 'compliance/LEGAL_STATUS.md'), 'utf8'));
    expect([...real.values()].filter((r) => r.status === 'approved').map((r) => r.channel)).toEqual(['inbound']);
  });

  it('DNS: SPF/DKIM/DMARC, όχι κύριο domain, όχι δωρεάν πάροχος', async () => {
    const records: Record<string, string[]> = {
      'good.example': ['v=spf1 include:_spf.example -all'],
      's1._domainkey.good.example': ['v=DKIM1; k=rsa; p=MIIB'],
      '_dmarc.good.example': ['v=DMARC1; p=none'],
      'nodmarc.example': ['v=spf1 -all'],
    };
    const txt = async (n: string) => records[n] ?? [];
    expect(await checkSendingDomains({ main_domain: 'auragram.gr', domains: [{ domain: 'good.example', dkim_selector: 's1', inboxes: [] }] }, txt)).toEqual([]);
    const bad = await checkSendingDomains(
      {
        main_domain: 'auragram.gr',
        domains: [
          { domain: 'nodmarc.example', dkim_selector: 's1', inboxes: [] },
          { domain: 'auragram.gr', dkim_selector: 's1', inboxes: [] },
          { domain: 'mail.auragram.gr', dkim_selector: 's1', inboxes: [] },
          { domain: 'gmail.com', dkim_selector: 's1', inboxes: [] },
        ],
      },
      txt,
    );
    expect(bad.join('\n')).toMatch(/nodmarc.example: λείπει DKIM/);
    expect(bad.join('\n')).toMatch(/nodmarc.example: λείπει DMARC/);
    expect(bad.filter((x) => x.includes('κύριο domain'))).toHaveLength(2);
    expect(bad.join('\n')).toMatch(/gmail.com: ποτέ αποστολή από δωρεάν πάροχο/);
  });

  it('όριο email: inboxes × ανά inbox, με ramp-up', () => {
    const v = { inboxes: 3, per_inbox_daily_limit: 40, ramp_up_weeks: 3, warmup_started_at: '2026-10-01' };
    expect(emailDailyLimit({ ...v, inboxes: 0 }, new Date('2026-12-01'))).toBe(0);
    expect(emailDailyLimit(v, new Date('2026-10-03'))).toBe(40); // εβδομάδα 1: 1/3
    expect(emailDailyLimit(v, new Date('2026-10-10'))).toBe(80); // εβδομάδα 2: 2/3
    expect(emailDailyLimit(v, new Date('2026-11-01'))).toBe(120);
  });

  it('το gate για κλήσεις θέλει πρόσφατο μητρώο αντιρρήσεων', async () => {
    const { ctx } = makeCtx();
    const g = await complianceGate({ ps: ctx.ps, config: ctx.config, channel: 'phone_b2b', campaignStatus: 'approved', now: new Date('2026-10-14'), objectionRegistryAt: '2026-08-01T00:00:00Z' });
    expect(g.reasons.join('\n')).toMatch(/μητρώο αντιρρήσεων/);
  });
});

describe('καμπάνια 1.000 leads (κριτήριο Φάσης 6)', () => {
  it('παράγεται, περνά QA, το export μπλοκάρεται σε pending και ξεμπλοκάρει σε approved', async () => {
    const { ctx, repo } = makeCtx({ dryRun: false, env: {} });
    const cfg = loadLeadsConfig(ctx.ps);
    const cell = ctx.config.matrix.cells.find((c) => c.id === 'kommotiria-booking')!;
    const db = await openSqlite(path.join(repo, 'data', 'leads.sqlite'));
    const store = new LeadStore(db, ctx.now);

    // Leads από τον ψεύτικο κόσμο
    const terms = ['κομμωτήριο', 'κουρείο', 'barber shop'];
    const world = new FakeWorld({ size: 3800, vertical: 'kommotiria', kad: '96.02', terms, cities: cfg.cities });
    const lim = new RateLimiter(Date.now, async () => {});
    await runLeadSourcing(
      { store, sources: [new GemiSource(cfg.sources.gemi, 'k', world.http, lim), new PlacesSource(cfg.sources.places, 'k', world.http, lim)], enricher: new WebsiteEnricher(cfg, world.http, lim), cfg, now: ctx.now, log: () => {} },
      { cellId: cell.id, vertical: 'kommotiria', service: 'booking_system', kad: ['96.02'], placesTerms: terms, cities: cfg.cities, budget: 100_000 },
    );

    // Templates του Outreach (fixture) στο pipeline του κελιού
    const dir = path.join(repo, 'pipeline', cell.id, 'campaign');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ['email.yaml', 'call.yaml', 'dm.yaml']) fs.copyFileSync(path.join(REAL_REPO, 'orchestrator/fixtures/outreach', f), path.join(dir, f));
    // Στοιχεία αποστολέα συμπληρωμένα (στο repo είναι {{TODO}} μέχρι να τα δώσουν οι ιδρυτές)
    const chFile = path.join(repo, 'config', 'channels.yaml');
    fs.writeFileSync(
      chFile,
      fs.readFileSync(chFile, 'utf8').replace(/"\{\{TODO: ([^}]*?)\}\}"/g, (_m, x: string) => (x.startsWith('http') ? `"${x.replace('auragram.gr', 'auragram.example')}"` : x.startsWith('Cal') ? '"https://cal.example/xartis"' : '"Οδός Παραδείγματος 1, Αθήνα"')),
    );
    const { ctx: ctx2 } = makeCtx({ repo, dryRun: false, env: {}, worker: new FixtureWorker() });

    const { templates } = loadTemplates(dir);
    const built = await buildCampaigns(ctx2, cell, store, templates);
    const email = built.find((b) => b.channel === 'email_gr')!;
    expect(email.members.length).toBe(1000);
    expect(email.messages).toHaveLength(3000); // 3 αγγίγματα

    const t0 = Date.now();
    const qa = await runCampaignQa(ctx2, cell, store, built);
    const qEmail = qa.find((q) => q.channel === 'email_gr')!;
    expect(qEmail.total).toBe(1000);
    expect(qEmail.passRate).toBeGreaterThanOrEqual(ctx2.config.volume.campaigns.min_qa_pass_rate);
    expect(qEmail.sample).toHaveLength(25);
    expect(sampleOf(email.messages, 25, email.id).map((m) => m.textId + m.businessId)).toEqual(qEmail.sample.map((m) => m.textId + m.businessId)); // αναπαράγεται
    const reports = writeQaReports(ctx2, cell, qa, 0.95);
    const masked = fs.readFileSync(reports.masked, 'utf8');
    expect(masked).not.toMatch(/info@|\+30\d/);
    expect(reports.full).toContain(path.join('exports', 'review'));
    expect(Date.now() - t0).toBeLessThan(30_000);

    // Gate 4 (άνθρωπος): η καμπάνια εγκρίνεται
    await db.run("update campaigns set status = 'approved', approved_by = 'christos' where id = ?", [email.id]);

    // 1) Κανάλι pending → μπλοκάρεται, χωρίς αρχείο
    const blocked = await exportCampaign(ctx2, store, email.id);
    expect(blocked.gate.allowed).toBe(false);
    expect(blocked.gate.reasons.join('\n')).toMatch(/email_gr είναι «pending»/);
    expect(blocked.file).toBeNull();
    expect(fs.existsSync(path.join(repo, 'exports', email.id))).toBe(false);

    // 2) Κανάλι approved (διπλό κλειδί), inboxes ζεσταμένα, domains με σωστό DNS → ξεμπλοκάρει
    fs.writeFileSync(chFile, fs.readFileSync(chFile, 'utf8').replace(/(id: email_gr\n(?:.*\n)*?\s+legal_status:) pending/, '$1 approved'));
    const legalFile = path.join(repo, 'compliance', 'LEGAL_STATUS.md');
    fs.writeFileSync(legalFile, fs.readFileSync(legalFile, 'utf8').replace(/\| email_gr \| pending \| \| \|/, '| email_gr | approved | 2026-11-01 | Δικηγόρος (test) |'));
    const volFile = path.join(repo, 'config', 'volume.yaml');
    fs.writeFileSync(volFile, fs.readFileSync(volFile, 'utf8').replace('inboxes: 0 ', 'inboxes: 10 ').replace('warmup_started_at: null', 'warmup_started_at: "2026-08-01"'));
    fs.writeFileSync(path.join(repo, 'config', 'sending-domains.yaml'), 'main_domain: auragram.gr\ndomains:\n  - { domain: send.example, dkim_selector: s1 }\n');
    const txt = async (n: string) =>
      ({ 'send.example': ['v=spf1 -all'], 's1._domainkey.send.example': ['v=DKIM1; p=x'], '_dmarc.send.example': ['v=DMARC1; p=none'] })[n] ?? [];
    const { ctx: ctx3 } = makeCtx({ repo, dryRun: false, env: {}, now: () => new Date('2026-11-02T08:00:00Z') });

    // ένα μέλος ζητά διαγραφή ΑΜΕΣΩΣ πριν το export (3ο σημείο ελέγχου)
    const firstMember = (await db.get<{ business_id: string }>("select business_id from campaign_members where campaign_id = ? and status = 'qa_passed' order by business_id limit 1", [email.id]))!;
    const c0 = (await store.contactsOf(firstMember.business_id)).find((c) => c.kind === 'email')!;
    await store.suppress('email', c0.value_norm, 'unsubscribe');

    const ok = await exportCampaign(ctx3, store, email.id, { txt, tool: 'smartlead' });
    expect(ok.gate.reasons).toEqual([]);
    expect(ok.gate.batchLimit).toBe(400); // 10 inboxes × 40
    expect(ok.rows).toBe(400);
    expect(ok.skippedSuppressed).toBe(1);
    const csvText = fs.readFileSync(ok.file!, 'utf8');
    expect(ok.file!).toContain(path.join('exports', email.id));
    expect(csvText.split('\n')[0]).toMatch(/^email,first_name,last_name,company_name,website,location,demo_url,unsubscribe_url,subject_1,body_1,send_day_1/);
    expect(csvText).not.toContain(c0.value_norm);
    expect(ok.remaining).toBe(1000 - 400 - 1 - qEmail.total + qEmail.passed);

    // Δεύτερο batch την ίδια μέρα: τα επόμενα 400 (το εργαλείο κάνει την αποστολή, εμείς μόνο το αρχείο)
    const ok2 = await exportCampaign(ctx3, store, email.id, { txt, tool: 'smartlead' });
    expect(ok2.rows).toBe(400);
    const emailsOf = (t: string) => [...t.matchAll(/^([^,"\n]+@[^,"\n]+),/gm)].map((m) => m[1]);
    const both = [...emailsOf(csvText), ...emailsOf(fs.readFileSync(ok2.file!, 'utf8'))];
    expect(both).toHaveLength(800);
    expect(new Set(both).size).toBe(800); // κανείς δύο φορές

    // Παγωμένη καμπάνια → μπλοκάρεται ξανά
    await db.run("update campaigns set status = 'frozen' where id = ?", [email.id]);
    const frozen = await exportCampaign(ctx3, store, email.id, { txt });
    expect(frozen.gate.reasons.join('\n')).toMatch(/παγώσει/);
    await db.close();
  }, 120_000);

  it('μασκάρισμα ονομάτων για ό,τι μπαίνει στο git', () => {
    expect(maskName('Κομμωτήριο Ελένη 12')).toBe('Κ••••••••ο Ε•••η 12');
  });
});

describe('Gate 4 και export μέσα από τον orchestrator (dry-run)', () => {
  it('QA → Gate 4 → η έγκριση γράφεται στην καμπάνια → export μπλοκάρεται (pending) και το κελί μένει campaign_approved', async () => {
    const { runNight, runExport } = await import('../src/runner.ts');
    const { parseTask } = await import('../src/state/task.ts');
    const { ctx, repo } = makeCtx({ env: { FACTORY_FAKE_LEADS: '300' } });
    const approvals = ctx.approvals as import('../src/approvals/dry-run.ts').DryRunApprovals;
    const id = 'kommotiria-booking';
    const read = () => parseTask(fs.readFileSync(path.join(repo, 'pipeline', id, 'task.yaml'), 'utf8'));
    for (const gate of ['idea', 'demo', 'publish'] as const) {
      await runNight(ctx);
      approvals.record(id, gate, 'approved', 'christos');
    }
    await runNight(ctx);
    expect(read().state).toBe('campaign_ready');
    expect(read().gates.campaign?.ref).toBe('review');
    const qaReport = fs.readFileSync(path.join(repo, 'pipeline', id, 'campaign', 'qa-report.md'), 'utf8');
    expect(qaReport).toContain('Τυχαίο δείγμα 25 μηνυμάτων');

    approvals.record(id, 'campaign', 'approved', 'panagiotis');
    await runNight(ctx);
    expect(read().state).toBe('campaign_approved'); // το export δεν τρέχει ποτέ αυτόματα
    const db = await openSqlite(path.join(repo, 'data', 'leads.sqlite'));
    const camps = await db.all<{ id: string; status: string; approved_by: string }>('select id, status, approved_by from campaigns where cell_id = ?', [id]);
    expect(camps.length).toBeGreaterThan(0);
    expect(camps.every((c) => c.status === 'approved' && c.approved_by === 'panagiotis')).toBe(true);
    await db.close();

    const r = await runExport(ctx, camps.find((c) => c.id.includes('email_gr'))!.id);
    expect(r.gate.allowed).toBe(false);
    expect(read().state).toBe('campaign_approved');
  }, 120_000);
});

describe('τα πραγματικά templates των 3 κελιών', () => {
  const banned = loadBannedPhrases(REAL_REPO);
  const { ctx } = makeCtx();
  for (const [cellId, vertical, name] of [
    ['kommotiria-booking', 'kommotiria', 'Κομμωτήριο Ελένη'],
    ['iatreia-support', 'iatreia', 'Παθολογικό Ιατρείο Νίκου'],
    ['xenodocheia-sales', 'xenodocheia', 'Ξενώνας Θάλασσα'],
  ] as const) {
    it(`${cellId}: φορτώνουν και περνούν το deterministic QA, με και χωρίς προσωποποίηση`, () => {
      const { templates, problems } = loadTemplates(path.join(REAL_REPO, 'pipeline', cellId, 'campaign'));
      expect(problems).toEqual([]);
      const other = ctx.config.matrix.verticals.filter((v) => v.id !== vertical).flatMap((v) => v.places).filter((t) => t.length >= 6);
      const r = { ...rc, cellId, campaignId: `${cellId}--email_gr--x` };
      const leads = [
        biz({ vertical, name, signals: { has_online_booking: false, has_viber: true }, reviews_count: 150 }),
        biz({ vertical, name: 'ΕΠΩΝΥΜΙΑ ΜΗΤΡΩΟΥ Ι.Κ.Ε.', sources: { name: src('gemi') } }),
      ];
      for (const l of leads) {
        const msgs = [
          ...renderEmail(templates.email!, r, view(l)),
          renderCall(templates.call!, { ...r, channel: 'phone_b2b' }, { ...view(l), phone: '+302100000001' }),
          renderDraft(templates.dm!, { ...r, channel: 'social_dm' }, view(l)),
        ];
        for (const m of msgs) expect(checkMessage(m, { banned, otherVerticalTerms: other }), `${cellId} ${m.textId}`).toEqual([]);
      }
    });
  }
});

describe('στοιχεία αποστολέα', () => {
  it('χωρίς διεύθυνση γραφείου η γραμμή παραλείπεται (D052)', () => {
    expect(senderBlock({ ...rc.sender, address: null })).toBe('Χρήστος & Παναγιώτης · Auragram\nhttps://auragram.example');
    expect(senderBlock(rc.sender)).toBe('Χρήστος & Παναγιώτης · Auragram\nhttps://auragram.example · Αθήνα');
  });
});
