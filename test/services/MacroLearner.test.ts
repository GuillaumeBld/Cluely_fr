import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { MacroLearner, MeetingStore, MeetingRow } from '../../src/services/MacroLearner';

function makeMeetingStore(meetings: MeetingRow[]): MeetingStore {
  return {
    getMeeting(meetingId: string) {
      return meetings.find((m) => m.id === meetingId);
    },
    countSameType(projectId: string, meetingType: string, excludeId: string) {
      return meetings.filter(
        (m) => m.project_id === projectId && m.meeting_type === meetingType && m.id !== excludeId,
      ).length;
    },
  };
}

describe('MacroLearner', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigration(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns MacroProposal on 2nd same-type meeting', () => {
    const meetings: MeetingRow[] = [
      { id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
      { id: 'm2', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
    ];
    const learner = new MacroLearner(db, makeMeetingStore(meetings));

    const proposal = learner.evaluate('m2');

    expect(proposal).not.toBeNull();
    expect(proposal!.projectId).toBe('finbiz');
    expect(proposal!.meetingType).toBe('weekly-sync');
    expect(proposal!.templateId).toBe('code-task');
    expect(proposal!.dispatchTarget).toBe('finbiz-archon');
  });

  it('returns null on 1st meeting (no prior same-type)', () => {
    const meetings: MeetingRow[] = [
      { id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
    ];
    const learner = new MacroLearner(db, makeMeetingStore(meetings));

    expect(learner.evaluate('m1')).toBeNull();
  });

  it('returns null on 3rd meeting when macro already exists', () => {
    const meetings: MeetingRow[] = [
      { id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
      { id: 'm2', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
      { id: 'm3', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
    ];

    // Insert an existing macro
    db.prepare(
      'INSERT INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target) VALUES (?, ?, ?, ?)',
    ).run('finbiz', 'weekly-sync', 'code-task', 'finbiz-archon');

    const learner = new MacroLearner(db, makeMeetingStore(meetings));

    // 3rd meeting: count of others == 2, so count !== 1 → null
    expect(learner.evaluate('m3')).toBeNull();
  });

  it('returns null for unknown meetingId', () => {
    const learner = new MacroLearner(db, makeMeetingStore([]));
    expect(learner.evaluate('nonexistent')).toBeNull();
  });

  it('returns null on 2nd meeting if macro already saved (idempotent)', () => {
    const meetings: MeetingRow[] = [
      { id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
      { id: 'm2', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'finbiz-archon' },
    ];

    db.prepare(
      'INSERT INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target) VALUES (?, ?, ?, ?)',
    ).run('finbiz', 'weekly-sync', 'code-task', 'finbiz-archon');

    const learner = new MacroLearner(db, makeMeetingStore(meetings));
    expect(learner.evaluate('m2')).toBeNull();
  });
});
