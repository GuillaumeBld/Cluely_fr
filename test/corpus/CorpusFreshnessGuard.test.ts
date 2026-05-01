import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CorpusFreshnessGuard } from '../../electron/corpus/CorpusFreshnessGuard';

describe('CorpusFreshnessGuard', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS corpus_chunks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_path TEXT NOT NULL,
        chunk_text TEXT NOT NULL,
        embedding BLOB,
        commit_hash TEXT,
        indexed_at INTEGER NOT NULL
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('returns stale=true when no chunks exist', () => {
    const guard = new CorpusFreshnessGuard(db, 2);
    const result = guard.check('proj-1');
    expect(result.stale).toBe(true);
    expect(result.lastIndexedAt).toBeNull();
    expect(result.ageHours).toBeNull();
  });

  it('returns stale=true when index is older than threshold', () => {
    const threeHoursAgo = Date.now() - 3 * 3_600_000;
    db.prepare(`
      INSERT INTO corpus_chunks (id, project_id, source_path, chunk_text, indexed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('c1', 'proj-1', 'src/a.ts', 'code', threeHoursAgo);

    const guard = new CorpusFreshnessGuard(db, 2);
    const result = guard.check('proj-1');
    expect(result.stale).toBe(true);
    expect(result.ageHours).toBeGreaterThan(2);
  });

  it('returns stale=false when index is recent', () => {
    const oneHourAgo = Date.now() - 1 * 3_600_000;
    db.prepare(`
      INSERT INTO corpus_chunks (id, project_id, source_path, chunk_text, indexed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('c1', 'proj-1', 'src/a.ts', 'code', oneHourAgo);

    const guard = new CorpusFreshnessGuard(db, 2);
    const result = guard.check('proj-1');
    expect(result.stale).toBe(false);
    expect(result.ageHours).toBeLessThan(2);
  });

  it('checks freshness per project', () => {
    const recent = Date.now() - 0.5 * 3_600_000;
    const old = Date.now() - 5 * 3_600_000;

    db.prepare(`INSERT INTO corpus_chunks (id, project_id, source_path, chunk_text, indexed_at) VALUES (?, ?, ?, ?, ?)`).run('c1', 'fresh-proj', 'a.ts', 'code', recent);
    db.prepare(`INSERT INTO corpus_chunks (id, project_id, source_path, chunk_text, indexed_at) VALUES (?, ?, ?, ?, ?)`).run('c2', 'stale-proj', 'b.ts', 'code', old);

    const guard = new CorpusFreshnessGuard(db, 2);
    expect(guard.check('fresh-proj').stale).toBe(false);
    expect(guard.check('stale-proj').stale).toBe(true);
  });
});
