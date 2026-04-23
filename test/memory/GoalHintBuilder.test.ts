import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { GoalHintBuilder } from '../../electron/memory/GoalHintBuilder';
import { ActionItem } from '../../electron/db/DatabaseManager';

/**
 * GoalHintBuilder uses DatabaseManager.getOpenActionItemsByGoal internally.
 * We test via a mock DatabaseManager that uses a real in-memory SQLite DB.
 */
describe('GoalHintBuilder', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
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

  function insertMeeting(id: string, actionItems: ActionItem[]) {
    const summaryJson = JSON.stringify({
      detailedSummary: {
        actionItems,
        keyPoints: [],
      },
    });
    db.prepare("INSERT INTO meetings (id, title, summary_json) VALUES (?, ?, ?)").run(
      id, `Meeting ${id}`, summaryJson
    );
  }

  it('returns open action items for a specific goal', () => {
    insertMeeting('m1', [
      { text: 'Deploy staging', goal_id: 'g1', goal_confidence: 0.8 },
      { text: 'Write tests', goal_id: 'g1', goal_confidence: 0.7 },
      { text: 'Review PR', goal_id: 'g1', goal_confidence: 0.75, completed_at: 1700000000 },
    ]);

    // Create a minimal mock DatabaseManager
    const mockDbManager = {
      getOpenActionItemsByGoal(goalId: string) {
        const rows = db.prepare(
          'SELECT id, summary_json, created_at FROM meetings ORDER BY created_at DESC'
        ).all() as { id: string; summary_json: string; created_at: string }[];

        const results: { text: string; meeting_id: string; goal_id: string; meeting_date: string }[] = [];
        for (const row of rows) {
          const data = JSON.parse(row.summary_json || '{}');
          const items: ActionItem[] = data?.detailedSummary?.actionItems || [];
          for (const item of items) {
            if (typeof item === 'object' && item.goal_id === goalId && !item.completed_at) {
              results.push({
                text: item.text,
                meeting_id: row.id,
                goal_id: goalId,
                meeting_date: row.created_at,
              });
            }
          }
        }
        return results;
      }
    } as any;

    const builder = new GoalHintBuilder(mockDbManager);
    const hints = builder.buildPreCallHint('g1');

    expect(hints).toHaveLength(2);
    expect(hints[0].text).toBe('Deploy staging');
    expect(hints[1].text).toBe('Write tests');
    // The completed item should NOT appear
    expect(hints.find(h => h.text === 'Review PR')).toBeUndefined();
  });

  it('returns empty array when no items match the goal', () => {
    insertMeeting('m1', [
      { text: 'Unrelated task', goal_id: 'g2', goal_confidence: 0.8 },
    ]);

    const mockDbManager = {
      getOpenActionItemsByGoal(goalId: string) {
        const rows = db.prepare('SELECT id, summary_json, created_at FROM meetings').all() as any[];
        const results: any[] = [];
        for (const row of rows) {
          const data = JSON.parse(row.summary_json || '{}');
          const items = data?.detailedSummary?.actionItems || [];
          for (const item of items) {
            if (typeof item === 'object' && item.goal_id === goalId && !item.completed_at) {
              results.push({ text: item.text, meeting_id: row.id, goal_id: goalId, meeting_date: row.created_at });
            }
          }
        }
        return results;
      }
    } as any;

    const builder = new GoalHintBuilder(mockDbManager);
    const hints = builder.buildPreCallHint('g1');
    expect(hints).toHaveLength(0);
  });
});
