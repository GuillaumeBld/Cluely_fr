import Database from 'better-sqlite3';
import { Decision } from '../memory/schema';

/**
 * Read-only query API for the decisions table.
 * Returns typed Decision records — no prose output.
 */
export class LedgerQueryService {
  private static instance: LedgerQueryService | undefined;
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  public static getInstance(db: Database.Database): LedgerQueryService {
    if (!LedgerQueryService.instance) {
      LedgerQueryService.instance = new LedgerQueryService(db);
    }
    return LedgerQueryService.instance;
  }

  public static resetInstance(): void {
    LedgerQueryService.instance = undefined;
  }

  /**
   * Query open commitments: decisions not yet dispatched and not conflict-resolved.
   */
  public queryOpenCommitments(goalId?: string, since?: string): Decision[] {
    const conditions = [
      'dispatched_job_id IS NULL',
      'conflict_resolved = 0',
    ];
    const params: (string | number)[] = [];

    if (goalId !== undefined) {
      conditions.push('goal_id = ?');
      params.push(goalId);
    }
    if (since !== undefined) {
      conditions.push('created_at > ?');
      params.push(since);
    }

    return this.db.prepare(
      `SELECT * FROM decisions WHERE ${conditions.join(' AND ')} ORDER BY created_at`
    ).all(...params) as Decision[];
  }

  /**
   * Query all decisions for a given meeting.
   */
  public queryByMeeting(meetingId: string): Decision[] {
    return this.db.prepare(
      'SELECT * FROM decisions WHERE meeting_id = ? ORDER BY created_at'
    ).all(meetingId) as Decision[];
  }

  /**
   * Query decisions within a date range.
   */
  public queryByDateRange(since: string, until: string): Decision[] {
    return this.db.prepare(
      'SELECT * FROM decisions WHERE created_at >= ? AND created_at <= ? ORDER BY created_at'
    ).all(since, until) as Decision[];
  }
}
