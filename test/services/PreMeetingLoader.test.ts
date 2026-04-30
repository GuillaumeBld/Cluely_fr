import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { DecisionLedger } from '../../electron/services/DecisionLedger';
import { LedgerQueryService } from '../../electron/services/LedgerQueryService';
import { PreMeetingLoader } from '../../electron/services/PreMeetingLoader';

describe('PreMeetingLoader', () => {
  let db: Database.Database;
  let ledger: DecisionLedger;
  let loader: PreMeetingLoader;

  beforeEach(() => {
    DecisionLedger.resetInstance();
    LedgerQueryService.resetInstance();
    PreMeetingLoader.resetInstance();
    db = new Database(':memory:');
    runMigration(db);
    ledger = DecisionLedger.getInstance(db);
    const queryService = LedgerQueryService.getInstance(db);
    loader = PreMeetingLoader.getInstance(queryService);

    // Seed a goal
    db.prepare('INSERT INTO goals (name) VALUES (?)').run('Sprint Goal');
  });

  afterEach(() => {
    db.close();
    DecisionLedger.resetInstance();
    LedgerQueryService.resetInstance();
    PreMeetingLoader.resetInstance();
  });

  it('includes openCommitments in pre-brief', () => {
    ledger.append({
      meeting_id: 'prev-mtg',
      timestamp: '2026-04-29T10:00:00Z',
      speaker: 'Alice',
      text: 'Will deliver the API by Wednesday',
      goal_id: 1,
    });
    ledger.append({
      meeting_id: 'prev-mtg',
      timestamp: '2026-04-29T10:05:00Z',
      speaker: 'Bob',
      text: 'Dispatched task already done',
    });

    // Mark the second as dispatched
    const dispatched = db.prepare("SELECT id FROM decisions WHERE speaker = 'Bob'").get() as { id: number };
    ledger.appendDispatch(dispatched.id, 'job-done');

    const brief = loader.buildPreBrief('upcoming-mtg', 1);
    expect(brief.meetingId).toBe('upcoming-mtg');
    expect(brief.openCommitments.length).toBe(1);
    expect(brief.openCommitments[0].speaker).toBe('Alice');
    expect(brief.openCommitments[0].text).toBe('Will deliver the API by Wednesday');
  });

  it('returns empty openCommitments when no decisions exist', () => {
    const brief = loader.buildPreBrief('new-mtg');
    expect(brief.openCommitments).toEqual([]);
  });

  it('returns typed Decision records, not prose', () => {
    ledger.append({
      meeting_id: 'prev-mtg',
      timestamp: '2026-04-29T10:00:00Z',
      speaker: 'Carol',
      text: 'Agreed to review PR by EOD',
    });

    const brief = loader.buildPreBrief('next-mtg');
    expect(brief.openCommitments.length).toBe(1);
    const commitment = brief.openCommitments[0];
    expect(commitment).toHaveProperty('id');
    expect(commitment).toHaveProperty('meeting_id');
    expect(commitment).toHaveProperty('speaker');
    expect(commitment).toHaveProperty('text_hash');
    expect(typeof commitment.id).toBe('number');
  });
});
