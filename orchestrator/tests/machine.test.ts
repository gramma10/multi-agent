import { describe, expect, it } from 'vitest';
import {
  GATE_OUTCOMES,
  GATE_WAITING_STATE,
  GateViolationError,
  HUMAN_ONLY_STATES,
  IllegalTransitionError,
  STATES,
  allowedTargets,
  assertTransition,
  type Actor,
  type State,
} from '../src/state/machine.ts';
import { applyTransition, newTask, parseTask, serializeTask } from '../src/state/task.ts';

const human: Actor = { kind: 'human', name: 'christos' };
const agent: Actor = { kind: 'agent', name: 'scout' };
const system: Actor = { kind: 'system', name: 'orchestrator' };

const HAPPY_PATH: Array<[State, State, Actor]> = [
  ['queued', 'scouting', system],
  ['scouting', 'brief_ready', agent],
  ['brief_ready', 'approved_idea', human],
  ['approved_idea', 'building', system],
  ['building', 'demo_ready', agent],
  ['demo_ready', 'approved_demo', human],
  ['approved_demo', 'content_writing', system],
  ['content_writing', 'content_ready', agent],
  ['content_ready', 'published', human],
  ['published', 'lead_sourcing', system],
  ['lead_sourcing', 'leads_ready', agent],
  ['leads_ready', 'campaign_drafting', system],
  ['campaign_drafting', 'qa_check', agent],
  ['qa_check', 'campaign_ready', agent],
  ['campaign_ready', 'campaign_approved', human],
  ['campaign_approved', 'exported', system],
  ['exported', 'tracking', system],
  ['tracking', 'done', system],
];

describe('state machine', () => {
  it('επιτρέπει όλο το happy path της §5.1', () => {
    for (const [from, to, actor] of HAPPY_PATH) {
      expect(() => assertTransition(from, to, actor)).not.toThrow();
    }
  });

  it('γράφει κάθε μετάβαση στο ιστορικό', () => {
    const t = newTask({ id: 'x-y', vertical: 'x', service: 'y', priority: 50, status: 'queued', fit: 'high', notes: '' }, new Date());
    for (const [, to, actor] of HAPPY_PATH) applyTransition(t, to, actor, new Date(), { worker: 'fixture' });
    expect(t.state).toBe('done');
    expect(t.history).toHaveLength(HAPPY_PATH.length);
    expect(t.history[2]).toMatchObject({ from: 'brief_ready', to: 'approved_idea', actor: 'human:christos' });
    // round trip μέσω YAML
    expect(parseTask(serializeTask(t))).toEqual(t);
  });

  it('πετά σε μη επιτρεπτές μεταβάσεις', () => {
    expect(() => assertTransition('queued', 'building', system)).toThrow(IllegalTransitionError);
    expect(() => assertTransition('scouting', 'demo_ready', agent)).toThrow(IllegalTransitionError);
    expect(() => assertTransition('done', 'queued', human)).toThrow(IllegalTransitionError);
    expect(() => assertTransition('exported', 'campaign_ready', system)).toThrow(IllegalTransitionError);
  });

  it('κάθε ζεύγος states εκτός κανόνων πετά (εξαντλητικά)', () => {
    let checked = 0;
    for (const from of STATES) {
      const ok = new Set(allowedTargets(from));
      for (const to of STATES) {
        if (ok.has(to)) continue;
        for (const actor of [human, agent, system]) {
          expect(() => assertTransition(from, to, actor)).toThrow();
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('κανένας agent και κανένα system δεν περνά gate', () => {
    for (const gate of Object.keys(GATE_OUTCOMES) as Array<keyof typeof GATE_OUTCOMES>) {
      const from = GATE_WAITING_STATE[gate];
      for (const to of Object.values(GATE_OUTCOMES[gate])) {
        expect(() => assertTransition(from, to, agent)).toThrow(GateViolationError);
        expect(() => assertTransition(from, to, system)).toThrow(GateViolationError);
        expect(() => assertTransition(from, to, human)).not.toThrow();
      }
    }
  });

  it('τα approved_* και rejected δεν γράφονται ποτέ από agent, από οποιοδήποτε state', () => {
    for (const to of HUMAN_ONLY_STATES) {
      for (const from of STATES) {
        expect(() => assertTransition(from, to, agent)).toThrow(GateViolationError);
        expect(() => assertTransition(from, to, system)).toThrow(GateViolationError);
      }
    }
  });

  it('changes επιστρέφει στο state εργασίας, rejected → queued μόνο από άνθρωπο', () => {
    expect(GATE_OUTCOMES.demo.changes).toBe('building');
    expect(GATE_OUTCOMES.publish.changes).toBe('content_writing');
    expect(GATE_OUTCOMES.campaign.changes).toBe('campaign_drafting');
    expect(() => assertTransition('rejected', 'queued', human)).not.toThrow();
    expect(() => assertTransition('rejected', 'queued', system)).toThrow();
  });
});
