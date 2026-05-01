import Database from 'better-sqlite3';

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface HealthChunk {
  id: number;
  projectId: string;
  chunkType: string;
  content: string;
  fetchedAt: string; // ISO
  stale: boolean;
}

export class HealthChunkWriter {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS health_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        chunk_type TEXT NOT NULL DEFAULT 'health-snapshot',
        content TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        stale INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  /**
   * Write a health chunk to the database.
   * @throws {SqliteError} If the database is locked or corrupted.
   */
  writeChunk(content: string, meta: { projectId: string; chunkType?: string; fetchedAt: string }): number {
    const stale = this.isStale(meta.fetchedAt) ? 1 : 0;
    const result = this.db.prepare(`
      INSERT INTO health_chunks (project_id, chunk_type, content, fetched_at, stale)
      VALUES (?, ?, ?, ?, ?)
    `).run(meta.projectId, meta.chunkType ?? 'health-snapshot', content, meta.fetchedAt, stale);
    return result.lastInsertRowid as number;
  }

  /**
   * Query health chunks by project ID and optional chunk type.
   * @throws {SqliteError} If the database is locked or corrupted.
   */
  queryChunks(filter: { projectId: string; chunkType?: string }): HealthChunk[] {
    const type = filter.chunkType ?? 'health-snapshot';
    const rows = this.db.prepare(`
      SELECT * FROM health_chunks
      WHERE project_id = ? AND chunk_type = ?
      ORDER BY fetched_at DESC
    `).all(filter.projectId, type) as any[];

    return rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      chunkType: r.chunk_type,
      content: r.content,
      fetchedAt: r.fetched_at,
      stale: r.stale === 1,
    }));
  }

  /**
   * Get the most recent health snapshot chunk for a project.
   * @throws {SqliteError} If the database is locked or corrupted.
   */
  getLatestChunk(projectId: string): HealthChunk | null {
    const row = this.db.prepare(`
      SELECT * FROM health_chunks
      WHERE project_id = ? AND chunk_type = 'health-snapshot'
      ORDER BY fetched_at DESC
      LIMIT 1
    `).get(projectId) as any | undefined;

    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      chunkType: row.chunk_type,
      content: row.content,
      fetchedAt: row.fetched_at,
      stale: row.stale === 1,
    };
  }

  markStaleChunks(): number {
    const threshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
    const result = this.db.prepare(`
      UPDATE health_chunks SET stale = 1 WHERE fetched_at < ? AND stale = 0
    `).run(threshold);
    return result.changes;
  }

  private isStale(fetchedAt: string): boolean {
    return Date.now() - new Date(fetchedAt).getTime() > STALE_THRESHOLD_MS;
  }
}
