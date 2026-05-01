import Database from 'better-sqlite3';
import { MemoryEdge } from './schema';

export interface CommitmentRow {
  edge_id: number;
  meeting_id: string | null;
  source_label: string;
  target_label: string;
  predicate: string;
  weight: number;
  created_at: string;
}

/**
 * Return structured commitment/decision edges within a date range.
 * Only returns rows where predicate IN ('agreed_with', 'owes', 'decided') — no prose.
 */
export function getCommitmentsInRange(
  db: Database.Database,
  days: number,
): CommitmentRow[] {
  const sql = `
    SELECT
      e.id AS edge_id,
      e.meeting_id,
      src.label AS source_label,
      tgt.label AS target_label,
      e.predicate,
      e.weight,
      e.created_at
    FROM memory_edges e
    JOIN memory_nodes src ON src.id = e.source_id
    JOIN memory_nodes tgt ON tgt.id = e.target_id
    WHERE e.predicate IN ('agreed_with', 'owes', 'decided')
      AND e.created_at >= datetime('now', ? || ' days')
    ORDER BY e.created_at DESC
  `;

  return db.prepare(sql).all(`-${days}`) as CommitmentRow[];
}
