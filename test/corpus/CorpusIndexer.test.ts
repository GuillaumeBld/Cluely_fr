import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { CorpusIndexer, chunkText } from '../../electron/corpus/CorpusIndexer';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execSync: vi.fn(actual.execSync) };
});

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

  it('removes stale chunks when re-indexing a shrunk file', async () => {
    const filePath = path.join(tmpDir, 'shrink.ts');

    // First index: large file producing multiple chunks
    const longContent = Array(80).fill('const line = "some code content here";').join('\n');
    fs.writeFileSync(filePath, longContent);

    const indexer = new CorpusIndexer(db);
    const count1 = await indexer.indexFile('proj-1', filePath, null);
    expect(count1).toBeGreaterThan(1);

    const rows1 = db.prepare('SELECT * FROM corpus_chunks WHERE project_id = ? AND source_path = ?')
      .all('proj-1', filePath) as any[];
    expect(rows1.length).toBe(count1);

    // Second index: file shrinks to 1 chunk
    fs.writeFileSync(filePath, 'const x = 1;');
    const count2 = await indexer.indexFile('proj-1', filePath, null);
    expect(count2).toBe(1);

    // Verify old chunks are gone
    const rows2 = db.prepare('SELECT * FROM corpus_chunks WHERE project_id = ? AND source_path = ?')
      .all('proj-1', filePath) as any[];
    expect(rows2.length).toBe(1);
  });

  describe('indexCommits', () => {
    const mockedExecSync = vi.mocked(execSync);

    afterEach(() => {
      mockedExecSync.mockReset();
    });

    it('parses git log output and stores commit chunks', () => {
      const gitLog = [
        'abc123\nFix: handle edge case\nDetailed body here\n---END---',
        'def456\nFeat: add feature\nMore details\n---END---',
        '',
      ].join('\n');

      mockedExecSync.mockReturnValueOnce(gitLog);

      const indexer = new CorpusIndexer(db);
      const count = indexer.indexCommits('proj-1', '/fake/repo', 10);

      expect(count).toBe(2);

      const rows = db.prepare('SELECT * FROM corpus_chunks WHERE project_id = ?').all('proj-1') as any[];
      expect(rows.length).toBe(2);
      expect(rows.some((r: any) => r.commit_hash === 'abc123')).toBe(true);
      expect(rows.some((r: any) => r.commit_hash === 'def456')).toBe(true);
    });

    it('handles git log failure gracefully', () => {
      mockedExecSync.mockImplementationOnce(() => { throw new Error('not a git repo'); });

      const indexer = new CorpusIndexer(db);
      const count = indexer.indexCommits('proj-1', '/fake/repo', 10);
      expect(count).toBe(0);
    });

    it('skips entries with empty messages', () => {
      const gitLog = 'abc123\n\n---END---\ndef456\nReal message\n---END---\n';
      mockedExecSync.mockReturnValueOnce(gitLog);

      const indexer = new CorpusIndexer(db);
      const count = indexer.indexCommits('proj-1', '/fake/repo', 10);

      const rows = db.prepare('SELECT * FROM corpus_chunks WHERE project_id = ?').all('proj-1') as any[];
      expect(rows.length).toBe(1);
      expect(rows[0].commit_hash).toBe('def456');
    });
  });

  describe('incrementalIndex', () => {
    const mockedExecSync = vi.mocked(execSync);

    afterEach(() => {
      mockedExecSync.mockReset();
    });

    it('indexes files and commits from a project config', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'main.ts'), 'export const main = true;');
      fs.writeFileSync(path.join(srcDir, 'util.ts'), 'export function util() {}');

      const gitLog = 'abc123\nCommit message\n---END---\n';
      mockedExecSync.mockReturnValue(gitLog);

      const indexer = new CorpusIndexer(db);
      const config = {
        projectId: 'test-proj',
        rootPath: tmpDir,
        includeGlobs: ['**/*.ts'],
        excludeGlobs: ['node_modules/**'],
        commitCap: 10,
        freshnessThresholdHours: 2,
      };

      const totalChunks = await indexer.incrementalIndex(config);
      expect(totalChunks).toBeGreaterThan(0);

      const rows = db.prepare('SELECT * FROM corpus_chunks WHERE project_id = ?').all('test-proj') as any[];
      expect(rows.length).toBeGreaterThan(0);

      const filePaths = [...new Set(rows.map((r: any) => r.source_path))];
      expect(filePaths.some((p: string) => p.includes('main.ts'))).toBe(true);
      expect(filePaths.some((p: string) => p === 'git:commit')).toBe(true);
    });
  });
});
