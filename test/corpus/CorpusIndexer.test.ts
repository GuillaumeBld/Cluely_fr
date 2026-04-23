import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CorpusIndexer, chunkText } from '../../electron/corpus/CorpusIndexer';

describe('chunkText', () => {
  it('splits text into chunks respecting token limit', () => {
    const text = Array(100).fill('hello world this is a test line').join('\n');
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(200 * 4 + 200); // rough upper bound
    }
  });

  it('returns single chunk for short text', () => {
    const chunks = chunkText('hello world');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('hello world');
  });

  it('handles empty text', () => {
    const chunks = chunkText('');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('');
  });
});

describe('CorpusIndexer', () => {
  let db: Database.Database;
  let tmpDir: string;

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

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-test-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexes a file and stores chunks in DB', async () => {
    const filePath = path.join(tmpDir, 'foo.ts');
    fs.writeFileSync(filePath, 'const x = 1;\nconst y = 2;\nexport { x, y };');

    const indexer = new CorpusIndexer(db);
    const count = await indexer.indexFile('proj-1', filePath, null);

    expect(count).toBeGreaterThan(0);

    const rows = db.prepare('SELECT * FROM corpus_chunks WHERE project_id = ?').all('proj-1') as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].source_path).toBe(filePath);
    expect(rows[0].chunk_text).toContain('const x = 1');
  });

  it('indexes a file with embeddings when embedder provided', async () => {
    const filePath = path.join(tmpDir, 'bar.ts');
    fs.writeFileSync(filePath, 'function bar() { return 42; }');

    const mockEmbedder = {
      getEmbedding: async (_text: string) => [0.1, 0.2, 0.3],
    };

    const indexer = new CorpusIndexer(db, mockEmbedder);
    await indexer.indexFile('proj-1', filePath, 'abc123');

    const rows = db.prepare('SELECT * FROM corpus_chunks WHERE project_id = ?').all('proj-1') as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].embedding).not.toBeNull();
    expect(rows[0].commit_hash).toBe('abc123');
  });

  it('skips files larger than 500KB', async () => {
    const filePath = path.join(tmpDir, 'huge.ts');
    fs.writeFileSync(filePath, 'x'.repeat(600_000));

    const indexer = new CorpusIndexer(db);
    const count = await indexer.indexFile('proj-1', filePath, null);
    expect(count).toBe(0);
  });

  it('handles non-existent file gracefully', async () => {
    const indexer = new CorpusIndexer(db);
    const count = await indexer.indexFile('proj-1', '/nonexistent/file.ts', null);
    expect(count).toBe(0);
  });
});
