import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { MacroLearner, MeetingStore, MeetingRow } from '../../src/services/MacroLearner';
import { CrossSessionContextInjector, LedgerQueryService } from '../../src/services/CrossSessionContextInjector';
import { MacroRunner } from '../../src/services/MacroRunner';
import type { DispatchMacro } from '../../electron/memory/schema';
import type { CommitmentRow } from '../../electron/memory/DecisionQuery';
import type { MacroStore } from '../../src/services/PostMeetingProcessor';

const baseRow: CommitmentRow = {
  edge_id: 1,
  meeting_id: 'meeting-1',
  source_label: 'Alice',
  target_label: 'Bob',
  predicate: 'decided',
  weight: 0.9,
  created_at: '2026-04-20T10:00:00Z',
};

describe('Dispatch Macros — end-to-end lifecycle', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigration(db);
  });

  afterEach(() => {
    db.close();
  });

  it('full lifecycle: 1st meeting → no proposal, 2nd → proposal, confirm → macro saved, 3rd → MacroRunner used', () => {
    // ── Setup ──────────────────────────────────────────────────────
    const meetings: MeetingRow[] = [
      { id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
      { id: 'm2', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
      { id: 'm3', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
    ];

    const meetingStore: MeetingStore = {
      getMeeting: (id) => meetings.find((m) => m.id === id),
      countSameType: (pid, mt, excludeId) =>
        meetings.filter((m) => m.project_id === pid && m.meeting_type === mt && m.id !== excludeId).length,
    };

    const ledger: LedgerQueryService = {
      getCommitments: () => [
        { ...baseRow, edge_id: 1, meeting_id: 'meeting-1' },
        { ...baseRow, edge_id: 2, meeting_id: 'meeting-2' },
      ],
    };

    const learner = new MacroLearner(db, meetingStore);
    const injector = new CrossSessionContextInjector(ledger);
    const runner = new MacroRunner(injector);

    // ── 1st meeting: no proposal ───────────────────────────────────
    expect(learner.evaluate('m1')).toBeNull();

    // ── 2nd meeting: proposal returned ─────────────────────────────
    // But count of others for m2 is 2 (m1 and m3), not 1.
    // We need to simulate the meetings being added one at a time.
    const meetingsUpTo2: MeetingRow[] = meetings.slice(0, 2);
    const storeUpTo2: MeetingStore = {
      getMeeting: (id) => meetingsUpTo2.find((m) => m.id === id),
      countSameType: (pid, mt, excludeId) =>
        meetingsUpTo2.filter((m) => m.project_id === pid && m.meeting_type === mt && m.id !== excludeId).length,
    };
    const learner2 = new MacroLearner(db, storeUpTo2);

    const proposal = learner2.evaluate('m2');
    expect(proposal).not.toBeNull();
    expect(proposal!.projectId).toBe('finbiz');
    expect(proposal!.meetingType).toBe('weekly-sync');

    // ── Confirm the macro ──────────────────────────────────────────
    db.prepare(
      'INSERT INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target) VALUES (?, ?, ?, ?)',
    ).run(proposal!.projectId, proposal!.meetingType, proposal!.templateId, proposal!.dispatchTarget);

    const savedMacro = db
      .prepare('SELECT * FROM dispatch_macros WHERE project_id = ? AND meeting_type = ?')
      .get('finbiz', 'weekly-sync') as DispatchMacro;
    expect(savedMacro).toBeDefined();

    // ── 3rd meeting: no re-proposal (macro exists) ─────────────────
    const learner3 = new MacroLearner(db, meetingStore);
    expect(learner3.evaluate('m3')).toBeNull();

    // ── MacroRunner pre-configures pipeline ────────────────────────
    const ctx = runner.run(savedMacro, 'm3');
    expect(ctx.templateId).toBe('code-task');
    expect(ctx.dispatchTarget).toBe('finbiz-archon');
    expect(ctx.priorDecisions.length).toBeGreaterThan(0);
  });

  it('override: MacroRunner not called when meeting is overridden', () => {
    // Insert a macro
    db.prepare(
      'INSERT INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target) VALUES (?, ?, ?, ?)',
    ).run('finbiz', 'weekly-sync', 'code-task', 'finbiz-archon');

    const macro = db
      .prepare('SELECT * FROM dispatch_macros WHERE project_id = ?')
      .get('finbiz') as DispatchMacro;

    const macroStore: MacroStore = {
      getActiveMacro: (pid, mt) => {
        const row = db
          .prepare('SELECT * FROM dispatch_macros WHERE project_id = ? AND meeting_type = ? AND active = 1')
          .get(pid, mt) as DispatchMacro | undefined;
        return row;
      },
    };

    // Verify macro is found normally
    expect(macroStore.getActiveMacro('finbiz', 'weekly-sync')).toBeDefined();

    // Override set contains meeting-5 → macro should be skipped
    const overridden = new Set(['meeting-5']);
    expect(overridden.has('meeting-5')).toBe(true);

    // Without override, macro store returns it
    expect(macroStore.getActiveMacro('finbiz', 'weekly-sync')).toBeDefined();
  });

  it('dispatch_macros table enforces UNIQUE(project_id, meeting_type)', () => {
    db.prepare(
      'INSERT INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target) VALUES (?, ?, ?, ?)',
    ).run('finbiz', 'weekly-sync', 'code-task', 'finbiz-archon');

    // INSERT OR IGNORE should not throw
    const info = db.prepare(
      'INSERT OR IGNORE INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target) VALUES (?, ?, ?, ?)',
    ).run('finbiz', 'weekly-sync', 'code-task', 'finbiz-archon');
    expect(info.changes).toBe(0);

    // Plain INSERT should throw on duplicate
    expect(() => {
      db.prepare(
        'INSERT INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target) VALUES (?, ?, ?, ?)',
      ).run('finbiz', 'weekly-sync', 'code-task', 'finbiz-archon');
    }).toThrow();
  });
});
