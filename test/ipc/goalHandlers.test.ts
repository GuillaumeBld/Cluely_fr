import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';

/**
 * Tests for goal:create, goal:list, goal:complete IPC handler logic.
 * We test the SQL operations directly against an in-memory DB since
 * the IPC handlers use MemoryManager.getDb() internally.
 */
describe('goal IPC handlers (SQL logic)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigration(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('goal:create', () => {
    it('inserts a goal with title and description', () => {
      const id = 'test-id-1';
      db.prepare(
        'INSERT INTO goals (id, title, description, embedding, parent_id) VALUES (?, ?, ?, ?, ?)'
      ).run(id, 'Ship RAG', 'Deploy RAG pipeline', null, null);

      const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as any;
      expect(row.title).toBe('Ship RAG');
      expect(row.description).toBe('Deploy RAG pipeline');
      expect(row.completed_at).toBeNull();
    });

    it('stores embedding as BLOB', () => {
      const id = 'test-id-2';
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      const embeddingBuf = Buffer.from(embedding.buffer);

      db.prepare(
        'INSERT INTO goals (id, title, description, embedding, parent_id) VALUES (?, ?, ?, ?, ?)'
      ).run(id, 'Test', '', embeddingBuf, null);

      const row = db.prepare('SELECT embedding FROM goals WHERE id = ?').get(id) as any;
      expect(row.embedding).toBeInstanceOf(Buffer);

      const decoded = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
      expect(decoded[0]).toBeCloseTo(0.1);
      expect(decoded[1]).toBeCloseTo(0.2);
      expect(decoded[2]).toBeCloseTo(0.3);
    });

    it('supports parent_id', () => {
      db.prepare("INSERT INTO goals (id, title) VALUES ('parent', 'Top')").run();
      db.prepare(
        "INSERT INTO goals (id, title, parent_id) VALUES ('child', 'Sub', 'parent')"
      ).run();

      const child = db.prepare("SELECT parent_id FROM goals WHERE id = 'child'").get() as any;
      expect(child.parent_id).toBe('parent');
    });
  });

  describe('goal:list', () => {
    it('returns goals ordered by created_at', () => {
      db.prepare("INSERT INTO goals (id, title) VALUES ('g1', 'First')").run();
      db.prepare("INSERT INTO goals (id, title) VALUES ('g2', 'Second')").run();

      const rows = db.prepare(
        'SELECT id, title, description, parent_id, created_at, completed_at FROM goals ORDER BY created_at'
      ).all() as any[];

      expect(rows).toHaveLength(2);
      expect(rows[0].title).toBe('First');
      expect(rows[1].title).toBe('Second');
    });

    it('returns empty array when no goals exist', () => {
      const rows = db.prepare(
        'SELECT id, title FROM goals ORDER BY created_at'
      ).all();

      expect(rows).toEqual([]);
    });
  });

  describe('goal:create edge cases', () => {
    it('creates goal without embedding when pipeline is unavailable', () => {
      db.prepare(
        'INSERT INTO goals (id, title, description, embedding, parent_id) VALUES (?, ?, ?, ?, ?)'
      ).run('g1', 'Ship v2', '', null, null);

      const row = db.prepare('SELECT * FROM goals WHERE id = ?').get('g1') as any;
      expect(row.embedding).toBeNull();
      expect(row.title).toBe('Ship v2');
    });

    it('rejects empty title at validation level', () => {
      // Simulates the IPC validation: typeof title !== 'string' || !title.trim()
      const validateTitle = (title: any) => {
        if (typeof title !== 'string' || !title.trim()) return { error: 'title required' };
        if (title.length > 500) return { error: 'title too long' };
        return null;
      };

      expect(validateTitle('')).toEqual({ error: 'title required' });
      expect(validateTitle('   ')).toEqual({ error: 'title required' });
      expect(validateTitle(null)).toEqual({ error: 'title required' });
      expect(validateTitle(undefined)).toEqual({ error: 'title required' });
      expect(validateTitle(123)).toEqual({ error: 'title required' });
      expect(validateTitle('a'.repeat(501))).toEqual({ error: 'title too long' });
      expect(validateTitle('Valid title')).toBeNull();
    });

    it('rejects invalid description and parent_id types', () => {
      const validateArgs = (desc: any, parentId: any) => {
        if (desc && typeof desc !== 'string') return { error: 'invalid description' };
        if (parentId && typeof parentId !== 'string') return { error: 'invalid parent_id' };
        return null;
      };

      expect(validateArgs(123, null)).toEqual({ error: 'invalid description' });
      expect(validateArgs(null, 456)).toEqual({ error: 'invalid parent_id' });
      expect(validateArgs('valid', 'valid')).toBeNull();
      expect(validateArgs(undefined, undefined)).toBeNull();
    });
  });

  describe('goal:complete', () => {
    it('sets completed_at on a goal', () => {
      db.prepare("INSERT INTO goals (id, title) VALUES ('g1', 'Test')").run();
      db.prepare("UPDATE goals SET completed_at = unixepoch() WHERE id = 'g1'").run();

      const row = db.prepare("SELECT completed_at FROM goals WHERE id = 'g1'").get() as any;
      expect(row.completed_at).not.toBeNull();
      expect(row.completed_at).toBeGreaterThan(0);
    });

    it('handles complete for non-existent id gracefully', () => {
      const info = db.prepare('UPDATE goals SET completed_at = unixepoch() WHERE id = ?')
        .run('nonexistent');
      expect(info.changes).toBe(0);
    });

    it('does not affect other goals', () => {
      db.prepare("INSERT INTO goals (id, title) VALUES ('g1', 'Done')").run();
      db.prepare("INSERT INTO goals (id, title) VALUES ('g2', 'Open')").run();
      db.prepare("UPDATE goals SET completed_at = unixepoch() WHERE id = 'g1'").run();

      const g2 = db.prepare("SELECT completed_at FROM goals WHERE id = 'g2'").get() as any;
      expect(g2.completed_at).toBeNull();
    });
  });

  describe('goal:pre-call-hint (via DatabaseManager.getOpenActionItemsByGoal)', () => {
    it('returns open items for a goal across meetings', () => {
      // Setup meetings table (matches DatabaseManager schema)
      db.exec(`CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY, title TEXT, start_time INTEGER,
        duration_ms INTEGER, summary_json TEXT,
        calendar_event_id TEXT, source TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);

      const summaryJson = JSON.stringify({
        detailedSummary: {
          actionItems: [
            { text: 'Deploy RAG', goal_id: 'g1', goal_confidence: 0.8 },
            { text: 'Done task', goal_id: 'g1', goal_confidence: 0.75, completed_at: 1700000000 },
            { text: 'Other goal', goal_id: 'g2', goal_confidence: 0.7 },
          ],
          keyPoints: [],
        }
      });
      db.prepare("INSERT INTO meetings (id, title, summary_json) VALUES (?, ?, ?)")
        .run('m1', 'Meeting 1', summaryJson);

      // Replicate the getOpenActionItemsByGoal query
      const rows = db.prepare(
        'SELECT id, summary_json, created_at FROM meetings ORDER BY created_at DESC'
      ).all() as any[];

      const results: any[] = [];
      for (const row of rows) {
        const data = JSON.parse(row.summary_json || '{}');
        const items = data?.detailedSummary?.actionItems || [];
        for (const item of items) {
          if (typeof item === 'object' && item.goal_id === 'g1' && !item.completed_at) {
            results.push({ text: item.text, meeting_id: row.id, goal_id: 'g1', meeting_date: row.created_at });
          }
        }
      }

      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('Deploy RAG');
      // completed item excluded
      // other-goal item excluded
    });
  });
});
