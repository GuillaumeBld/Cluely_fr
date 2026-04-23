// electron/corpus/CorpusFreshnessGuard.ts
// Checks whether the corpus index is fresh enough for task dispatch

import Database from 'better-sqlite3';

export interface FreshnessResult {
  stale: boolean;
  lastIndexedAt: number | null;
  ageHours: number | null;
}

export class CorpusFreshnessGuard {
  private db: Database.Database;
  private thresholdHours: number;

  constructor(db: Database.Database, thresholdHours: number = 2) {
    this.db = db;
    this.thresholdHours = thresholdHours;
  }

  check(projectId: string): FreshnessResult {
    const row = this.db.prepare(
      'SELECT MAX(indexed_at) as last FROM corpus_chunks WHERE project_id = ?'
    ).get(projectId) as { last: number | null } | undefined;

    const lastIndexedAt = row?.last ?? null;

    if (lastIndexedAt === null) {
      return { stale: true, lastIndexedAt: null, ageHours: null };
    }

    const ageHours = (Date.now() - lastIndexedAt) / 3_600_000;
    return {
      stale: ageHours > this.thresholdHours,
      lastIndexedAt,
      ageHours,
    };
  }
}
