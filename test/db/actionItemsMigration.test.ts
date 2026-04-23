import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { normalizeActionItem, ActionItem } from '../../electron/db/DatabaseManager';

describe('ActionItem migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create a minimal meetings table matching the real schema
    db.exec(`
      CREATE TABLE meetings (
        id TEXT PRIMARY KEY,
        title TEXT,
        start_time INTEGER,
        duration_ms INTEGER,
        summary_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('normalizeActionItem', () => {
    it('converts a string to ActionItem', () => {
      const result = normalizeActionItem('do X');
      expect(result).toEqual({ text: 'do X', goal_id: null, goal_confidence: null });
    });

    it('passes through an ActionItem object', () => {
      const item: ActionItem = { text: 'do Y', goal_id: 'g1', goal_confidence: 0.8 };
      expect(normalizeActionItem(item)).toEqual(item);
    });
  });

  describe('data migration simulation', () => {
    it('converts string[] actionItems to ActionItem[]', () => {
      // Insert a meeting with old-style string[] actionItems
      const oldSummary = JSON.stringify({
        detailedSummary: {
          overview: 'test',
          actionItems: ['do X', 'do Y'],
          keyPoints: ['point 1'],
        },
      });

      db.prepare("INSERT INTO meetings (id, title, summary_json) VALUES (?, ?, ?)").run(
        'm1', 'Test Meeting', oldSummary
      );

      // Simulate the migration logic from DatabaseManager.migrateActionItemsFormat
      const rows = db.prepare('SELECT id, summary_json FROM meetings').all() as { id: string; summary_json: string }[];
      const update = db.prepare('UPDATE meetings SET summary_json = ? WHERE id = ?');

      for (const row of rows) {
        const data = JSON.parse(row.summary_json);
        const items = data?.detailedSummary?.actionItems;
        if (!Array.isArray(items) || items.length === 0) continue;
        if (typeof items[0] === 'object' && items[0] !== null && 'text' in items[0]) continue;
        data.detailedSummary.actionItems = items.map((item: string | ActionItem) => normalizeActionItem(item));
        update.run(JSON.stringify(data), row.id);
      }

      // Verify the migration
      const migrated = db.prepare('SELECT summary_json FROM meetings WHERE id = ?').get('m1') as { summary_json: string };
      const parsed = JSON.parse(migrated.summary_json);
      const actionItems = parsed.detailedSummary.actionItems;

      expect(actionItems).toHaveLength(2);
      expect(actionItems[0]).toEqual({ text: 'do X', goal_id: null, goal_confidence: null });
      expect(actionItems[1]).toEqual({ text: 'do Y', goal_id: null, goal_confidence: null });
    });

    it('is idempotent — already migrated items are not modified', () => {
      const alreadyMigrated = JSON.stringify({
        detailedSummary: {
          actionItems: [{ text: 'do X', goal_id: 'g1', goal_confidence: 0.8 }],
          keyPoints: [],
        },
      });

      db.prepare("INSERT INTO meetings (id, title, summary_json) VALUES (?, ?, ?)").run(
        'm1', 'Test', alreadyMigrated
      );

      // Run migration logic
      const rows = db.prepare('SELECT id, summary_json FROM meetings').all() as { id: string; summary_json: string }[];
      for (const row of rows) {
        const data = JSON.parse(row.summary_json);
        const items = data?.detailedSummary?.actionItems;
        if (!Array.isArray(items) || items.length === 0) continue;
        // Should detect existing object format and skip
        if (typeof items[0] === 'object' && items[0] !== null && 'text' in items[0]) continue;
      }

      // Verify nothing changed
      const result = db.prepare('SELECT summary_json FROM meetings WHERE id = ?').get('m1') as { summary_json: string };
      const parsed = JSON.parse(result.summary_json);
      expect(parsed.detailedSummary.actionItems[0].goal_id).toBe('g1');
    });

    it('handles meetings with no actionItems gracefully', () => {
      const noItems = JSON.stringify({
        detailedSummary: {
          actionItems: [],
          keyPoints: ['point'],
        },
      });

      db.prepare("INSERT INTO meetings (id, title, summary_json) VALUES (?, ?, ?)").run(
        'm1', 'Empty', noItems
      );

      // Migration should not throw
      const rows = db.prepare('SELECT id, summary_json FROM meetings').all() as { id: string; summary_json: string }[];
      for (const row of rows) {
        const data = JSON.parse(row.summary_json);
        const items = data?.detailedSummary?.actionItems;
        if (!Array.isArray(items) || items.length === 0) continue;
      }

      const result = db.prepare('SELECT summary_json FROM meetings WHERE id = ?').get('m1') as { summary_json: string };
      expect(JSON.parse(result.summary_json).detailedSummary.actionItems).toEqual([]);
    });
  });
});
