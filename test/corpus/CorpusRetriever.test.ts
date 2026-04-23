import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CorpusRetriever } from '../../electron/corpus/CorpusRetriever';

function embeddingToBlob(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

describe('CorpusRetriever', () => {
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

  it('returns top-K chunks sorted by cosine similarity', async () => {
    // Seed 3 chunks with known embeddings
    const insert = db.prepare(`
      INSERT INTO corpus_chunks (id, project_id, source_path, chunk_text, embedding, commit_hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('c1', 'proj-1', 'src/auth.ts', 'token handling code', embeddingToBlob([1, 0, 0]), null, Date.now());
    insert.run('c2', 'proj-1', 'src/db.ts', 'database queries', embeddingToBlob([0, 1, 0]), null, Date.now());
    insert.run('c3', 'proj-1', 'src/api.ts', 'api endpoints', embeddingToBlob([0.7, 0.7, 0]), null, Date.now());

    const mockEmbedder = {
      getEmbedding: async (_text: string) => [1, 0, 0], // most similar to c1
    };

    const retriever = new CorpusRetriever(db, mockEmbedder);
    const results = await retriever.query('authentication', 'proj-1', 2);

    expect(results).toHaveLength(2);
    expect(results[0].source_path).toBe('src/auth.ts');
    expect(results[0].score).toBeCloseTo(1.0);
    expect(results[0]).toMatchObject({
      source_path: expect.any(String),
      chunk_text: expect.any(String),
      score: expect.any(Number),
    });
  });

  it('returns empty for project with no chunks', async () => {
    const mockEmbedder = {
      getEmbedding: async (_text: string) => [1, 0, 0],
    };

    const retriever = new CorpusRetriever(db, mockEmbedder);
    const results = await retriever.query('anything', 'empty-proj', 5);
    expect(results).toHaveLength(0);
  });

  it('skips chunks without embeddings', async () => {
    const insert = db.prepare(`
      INSERT INTO corpus_chunks (id, project_id, source_path, chunk_text, embedding, commit_hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('c1', 'proj-1', 'src/a.ts', 'code a', null, null, Date.now()); // no embedding
    insert.run('c2', 'proj-1', 'src/b.ts', 'code b', embeddingToBlob([1, 0, 0]), null, Date.now());

    const mockEmbedder = { getEmbedding: async () => [1, 0, 0] };
    const retriever = new CorpusRetriever(db, mockEmbedder);
    const results = await retriever.query('query', 'proj-1', 5);

    expect(results).toHaveLength(1);
    expect(results[0].source_path).toBe('src/b.ts');
  });
});
