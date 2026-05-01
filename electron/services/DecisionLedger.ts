import crypto from 'crypto';
import Database from 'better-sqlite3';
import { Decision } from '../memory/schema';

export interface DecisionEntry {
  meeting_id: string;
  timestamp: string;
  speaker: string;
  text: string;
  goal_id?: string | null;
  source_edge_id?: number | null;
}

/**
 * Append-only write API for the decisions table.
 * Idempotent: duplicate (meeting_id, text_hash) pairs are silently ignored.
 */
export class DecisionLedger {
  private static instance: DecisionLedger | undefined;
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  public static getInstance(db: Database.Database): DecisionLedger {
    if (!DecisionLedger.instance) {
      DecisionLedger.instance = new DecisionLedger(db);
    }
    return DecisionLedger.instance;
  }

  public static resetInstance(): void {
    DecisionLedger.instance = undefined;
  }

  /**
   * Append a decision to the ledger. Idempotent via UNIQUE(meeting_id, text_hash).
   */
  public append(entry: DecisionEntry): Decision | undefined {
    const text_hash = sha256(entry.text);
    const info = this.db.prepare(`
      INSERT OR IGNORE INTO decisions (meeting_id, timestamp, speaker, text, text_hash, goal_id, source_edge_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.meeting_id,
      entry.timestamp,
      entry.speaker,
      entry.text,
      text_hash,
      entry.goal_id ?? null,
      entry.source_edge_id ?? null,
    );

    if (info.changes === 0) return undefined; // duplicate, ignored
    return this.db.prepare('SELECT * FROM decisions WHERE id = ?').get(info.lastInsertRowid) as Decision;
  }

  /**
   * Mark a decision as having its conflict resolved.
   */
  public appendConflictResolution(decisionId: number): void {
    this.db.prepare('UPDATE decisions SET conflict_resolved = 1 WHERE id = ?').run(decisionId);
  }

  /**
   * Record a dispatched job against a decision.
   */
  public appendDispatch(decisionId: number, jobId: string): void {
    this.db.prepare('UPDATE decisions SET dispatched_job_id = ? WHERE id = ?').run(jobId, decisionId);
  }
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
