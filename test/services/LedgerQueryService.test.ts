import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { DecisionLedger } from '../../electron/services/DecisionLedger';
import { LedgerQueryService } from '../../electron/services/LedgerQueryService';

describe('LedgerQueryService', () => {
  let db: Database.Database;
  let ledger: DecisionLedger;
  let query: LedgerQueryService;

  beforeEach(() => {
    DecisionLedger.resetInstance();
    LedgerQueryService.resetInstance();
    db = new Database(':memory:');
    runMigration(db);
    ledger = DecisionLedger.getInstance(db);
    query = LedgerQueryService.getInstance(db);

    // Seed a goal for FK references
    db.prepare('INSERT INTO goals (name) VALUES (?)').run('Project Alpha');
  });

  afterEach(() => {
    db.close();
    DecisionLedger.resetInstance();
    LedgerQueryService.resetInstance();
  });

  function seedDecisions() {
    ledger.append({
      meeting_id: 'mtg-1',
      timestamp: '2026-04-28T10:00:00Z',
      speaker: 'Alice',
      text: 'Decision A — open commitment',
      goal_id: 1,
    });
    ledger.append({
      meeting_id: 'mtg-1',
      timestamp: '2026-04-28T10:05:00Z',
      speaker: 'Bob',
      text: 'Decision B — will be dispatched',
    });
    ledger.append({
      meeting_id: 'mtg-2',
      timestamp: '2026-04-29T09:00:00Z',
      speaker: 'Carol',
      text: 'Decision C — open, different meeting',
    });

    // Dispatch decision B
    const decB = db.prepare("SELECT id FROM decisions WHERE text LIKE '%dispatched%'").get() as { id: number };
    ledger.appendDispatch(decB.id, 'job-001');
  }

  describe('queryOpenCommitments', () => {
    it('returns only non-dispatched, non-resolved decisions', () => {
      seedDecisions();
      const open = query.queryOpenCommitments();
      expect(open.length).toBe(2); // A and C, not B (dispatched)
      expect(open.every(d => d.dispatched_job_id === null)).toBe(true);
      expect(open.every(d => d.conflict_resolved === 0)).toBe(true);
    });

    it('filters by goal_id when provided', () => {
      seedDecisions();
      const open = query.queryOpenCommitments(1);
      expect(open.length).toBe(1);
      expect(open[0].goal_id).toBe(1);
    });
  });

  describe('queryByMeeting', () => {
    it('returns all decisions for a meeting', () => {
      seedDecisions();
      const decisions = query.queryByMeeting('mtg-1');
      expect(decisions.length).toBe(2);
      expect(decisions.every(d => d.meeting_id === 'mtg-1')).toBe(true);
    });

    it('returns empty array for unknown meeting', () => {
      expect(query.queryByMeeting('nonexistent')).toEqual([]);
    });
  });

  describe('queryByDateRange', () => {
    it('returns structured Decision records (not prose)', () => {
      seedDecisions();
      const decisions = query.queryByDateRange('2026-04-28 00:00:00', '2026-12-31 23:59:59');
      expect(decisions.length).toBe(3);
      for (const d of decisions) {
        expect(d).toHaveProperty('id');
        expect(d).toHaveProperty('meeting_id');
        expect(d).toHaveProperty('speaker');
        expect(d).toHaveProperty('text');
        expect(d).toHaveProperty('text_hash');
        expect(typeof d.id).toBe('number');
        expect(typeof d.text).toBe('string');
      }
    });
  });
});
