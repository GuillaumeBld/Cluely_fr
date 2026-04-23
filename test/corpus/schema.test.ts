import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

describe('corpus_chunks table schema', () => {
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
      CREATE INDEX IF NOT EXISTS idx_corpus_chunks_project ON corpus_chunks(project_id);
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('creates corpus_chunks table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='corpus_chunks'").get() as any;
    expect(row).toBeDefined();
    expect(row.name).toBe('corpus_chunks');
  });

  it('has all required columns', () => {
    const cols = (db.prepare("PRAGMA table_info(corpus_chunks)").all() as any[]).map(c => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('project_id');
    expect(cols).toContain('source_path');
    expect(cols).toContain('chunk_text');
    expect(cols).toContain('embedding');
    expect(cols).toContain('commit_hash');
    expect(cols).toContain('indexed_at');
  });

  it('has project_id index', () => {
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_corpus_chunks_project'").get() as any;
    expect(idx).toBeDefined();
  });

  it('inserts and retrieves a chunk', () => {
    db.prepare(`
      INSERT INTO corpus_chunks (id, project_id, source_path, chunk_text, commit_hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('chunk-1', 'proj-1', '/src/foo.ts', 'const x = 1;', 'abc123', Date.now());

    const row = db.prepare('SELECT * FROM corpus_chunks WHERE id = ?').get('chunk-1') as any;
    expect(row.project_id).toBe('proj-1');
    expect(row.source_path).toBe('/src/foo.ts');
    expect(row.chunk_text).toBe('const x = 1;');
  });
});
