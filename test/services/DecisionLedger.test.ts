import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { DecisionLedger } from '../../electron/services/DecisionLedger';

describe('DecisionLedger', () => {
  let db: Database.Database;
  let ledger: DecisionLedger;

  const baseEntry = {
    meeting_id: 'meeting-001',
    timestamp: '2026-04-30T10:00:00Z',
    speaker: 'Alice',
    text: 'We will ship v2 by Friday',
  };

  beforeEach(() => {
    DecisionLedger.resetInstance();
    db = new Database(':memory:');
    runMigration(db);
    ledger = DecisionLedger.getInstance(db);
  });

  afterEach(() => {
    db.close();
    DecisionLedger.resetInstance();
  });

  describe('append', () => {
    it('inserts a decision and returns it', () => {
      const decision = ledger.append(baseEntry);
      expect(decision).toBeDefined();
      expect(decision!.id).toBe(1);
      expect(decision!.meeting_id).toBe('meeting-001');
      expect(decision!.speaker).toBe('Alice');
      expect(decision!.text).toBe('We will ship v2 by Friday');
      expect(decision!.text_hash).toBeTruthy();
      expect(decision!.goal_id).toBeNull();
      expect(decision!.conflict_resolved).toBe(0);
    });

    it('is idempotent — duplicate text+meeting is silently ignored', () => {
      const first = ledger.append(baseEntry);
      const second = ledger.append(baseEntry);
      expect(first).toBeDefined();
      expect(second).toBeUndefined(); // ignored

      const count = (db.prepare('SELECT COUNT(*) as cnt FROM decisions').get() as { cnt: number }).cnt;
      expect(count).toBe(1);
    });

    it('allows same text in different meetings', () => {
      ledger.append(baseEntry);
      const other = ledger.append({ ...baseEntry, meeting_id: 'meeting-002' });
      expect(other).toBeDefined();
      expect(other!.meeting_id).toBe('meeting-002');
    });

    it('stores goal_id when provided', () => {
      // Create a goal to satisfy FK constraint
      db.prepare('INSERT INTO goals (name) VALUES (?)').run('Test Goal');
      const goalId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;

      const decision = ledger.append({ ...baseEntry, goal_id: goalId });
      expect(decision!.goal_id).toBe(goalId);
    });
  });

  describe('appendConflictResolution', () => {
    it('sets conflict_resolved to 1', () => {
      const decision = ledger.append(baseEntry)!;
      expect(decision.conflict_resolved).toBe(0);

      ledger.appendConflictResolution(decision.id);

      const updated = db.prepare('SELECT * FROM decisions WHERE id = ?').get(decision.id) as { conflict_resolved: number };
      expect(updated.conflict_resolved).toBe(1);
    });
  });

  describe('appendDispatch', () => {
    it('sets dispatched_job_id on the decision', () => {
      const decision = ledger.append(baseEntry)!;
      expect(decision.dispatched_job_id).toBeNull();

      ledger.appendDispatch(decision.id, 'job-xyz-123');

      const updated = db.prepare('SELECT * FROM decisions WHERE id = ?').get(decision.id) as { dispatched_job_id: string };
      expect(updated.dispatched_job_id).toBe('job-xyz-123');
    });
  });
});
