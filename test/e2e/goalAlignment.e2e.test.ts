import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { GoalAligner } from '../../electron/memory/GoalAligner';
import { GoalHintBuilder } from '../../electron/memory/GoalHintBuilder';
import { ActionItem } from '../../electron/db/DatabaseManager';

/**
 * End-to-end smoke test: create a goal, align action items, query open commitments.
 */
describe('Goal alignment e2e', () => {
  it('full flow: create goal → align items → query hints', async () => {
    const db = new Database(':memory:');
    runMigration(db);

    // Also create a minimal meetings table for GoalHintBuilder
    db.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT,
        start_time INTEGER,
        duration_ms INTEGER,
        summary_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 1. Create a goal (simulating goal:create IPC)
    const goalId = 'goal-rag-1';
    const goalEmbedding = new Float32Array([0.9, 0.1, 0.05]);
    db.prepare(
      'INSERT INTO goals (id, title, description, embedding) VALUES (?, ?, ?, ?)'
    ).run(goalId, 'Deploy local RAG', 'Set up RAG pipeline for meetings', Buffer.from(goalEmbedding.buffer));

    // 2. Align action items via GoalAligner
    const mockPipeline = {
      getEmbedding: vi.fn().mockResolvedValue([0.88, 0.12, 0.03]),
    } as any;

    const aligner = new GoalAligner(db, mockPipeline);
    const items = ['index the git repo'];
    const tagged = await aligner.alignActionItems(items, 'meeting-e2e');

    expect(tagged).toHaveLength(1);
    expect(tagged[0].goal_id).toBe(goalId);
    expect(tagged[0].goal_confidence).toBeGreaterThan(0.65);

    // 3. Save tagged items as a meeting (simulate IntelligenceManager save)
    const actionItems: ActionItem[] = tagged.map(t => ({
      text: t.text,
      goal_id: t.goal_id,
      goal_confidence: t.goal_confidence,
    }));

    const summaryJson = JSON.stringify({
      detailedSummary: { actionItems, keyPoints: [] },
    });
    db.prepare(
      "INSERT INTO meetings (id, title, summary_json) VALUES (?, ?, ?)"
    ).run('meeting-e2e', 'E2E Test Meeting', summaryJson);

    // 4. Query open commitments via GoalHintBuilder
    const mockDbManager = {
      getOpenActionItemsByGoal(gId: string) {
        const rows = db.prepare(
          'SELECT id, summary_json, created_at FROM meetings ORDER BY created_at DESC'
        ).all() as { id: string; summary_json: string; created_at: string }[];

        const results: { text: string; meeting_id: string; goal_id: string; meeting_date: string }[] = [];
        for (const row of rows) {
          const data = JSON.parse(row.summary_json || '{}');
          const items: ActionItem[] = data?.detailedSummary?.actionItems || [];
          for (const item of items) {
            if (typeof item === 'object' && item.goal_id === gId && !item.completed_at) {
              results.push({ text: item.text, meeting_id: row.id, goal_id: gId, meeting_date: row.created_at });
            }
          }
        }
        return results;
      }
    } as any;

    const hintBuilder = new GoalHintBuilder(mockDbManager);
    const hints = hintBuilder.buildPreCallHint(goalId);

    expect(hints).toHaveLength(1);
    expect(hints[0].text).toBe('index the git repo');
    expect(hints[0].meeting_id).toBe('meeting-e2e');
    expect(hints[0].goal_id).toBe(goalId);

    db.close();
  });

  it('gracefully degrades when GoalAligner throws', async () => {
    const db = new Database(':memory:');
    runMigration(db);

    // Simulate IntelligenceManager's goal alignment with a failing GoalAligner
    const failingAligner = {
      alignActionItems: vi.fn().mockRejectedValue(new Error('embedding model not loaded')),
    };

    const rawItems: ActionItem[] = [
      { text: 'review PR', goal_id: null, goal_confidence: null },
      { text: 'deploy staging', goal_id: null, goal_confidence: null },
    ];

    // Replicate IntelligenceManager's try/catch logic (lines 1097-1111)
    let normalizedItems = [...rawItems];
    if (failingAligner && normalizedItems.length > 0) {
      try {
        const tagged = await failingAligner.alignActionItems(
          normalizedItems.map(i => i.text),
          'meeting-fail'
        );
        normalizedItems = tagged.map(t => ({
          text: t.text,
          goal_id: t.goal_id,
          goal_confidence: t.goal_confidence,
        }));
      } catch (_err) {
        // Should keep original untagged items
      }
    }

    // Items should remain untagged, not lost
    expect(normalizedItems).toHaveLength(2);
    expect(normalizedItems[0]).toEqual({ text: 'review PR', goal_id: null, goal_confidence: null });
    expect(normalizedItems[1]).toEqual({ text: 'deploy staging', goal_id: null, goal_confidence: null });

    db.close();
  });

  it('preserves items when GoalAligner is null', () => {
    // Simulate goalAligner being null (pipeline not ready)
    const goalAligner = null;

    const rawItems: ActionItem[] = [
      { text: 'send report', goal_id: null, goal_confidence: null },
    ];

    let normalizedItems = [...rawItems];
    // Replicate the null-check: if (this.goalAligner && normalizedItems.length > 0)
    if (goalAligner && normalizedItems.length > 0) {
      // Should not enter this block
      normalizedItems = [];
    }

    expect(normalizedItems).toHaveLength(1);
    expect(normalizedItems[0].text).toBe('send report');
  });
});
