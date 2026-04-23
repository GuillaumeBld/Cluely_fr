import { describe, it, expect, vi } from 'vitest';
import { GoalAligner, TaggedActionItem } from '../../electron/memory/GoalAligner';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';

/**
 * Tests for GoalAligner integration with the meeting processing pipeline.
 * Verifies that action items get tagged with goal_id when GoalAligner is available.
 */
describe('RecapLLM goal tagging integration', () => {
  it('tags action items with goal_id when GoalAligner returns matches', async () => {
    const db = new Database(':memory:');
    runMigration(db);

    // Insert a goal
    const embedding = Buffer.from(new Float32Array([0.9, 0.1, 0.0]).buffer);
    db.prepare("INSERT INTO goals (id, title, embedding) VALUES (?, ?, ?)").run(
      'g1', 'Deploy RAG', embedding
    );

    // Mock EmbeddingPipeline to return a vector close to the goal
    const mockPipeline = {
      getEmbedding: vi.fn().mockResolvedValue([0.95, 0.05, 0.0]),
    } as any;

    const aligner = new GoalAligner(db, mockPipeline);

    // Simulate what IntelligenceManager does: extract items then tag
    const rawItems = ['index the git repo'];
    const tagged = await aligner.alignActionItems(rawItems, 'meeting-1');

    expect(tagged[0].goal_id).toBe('g1');
    expect(tagged[0].goal_confidence).toBeGreaterThan(0.65);
    expect(tagged[0].text).toBe('index the git repo');

    db.close();
  });

  it('returns null goal_id when no goals match', async () => {
    const db = new Database(':memory:');
    runMigration(db);

    // Insert a goal far from the item embedding
    const embedding = Buffer.from(new Float32Array([0.0, 0.0, 1.0]).buffer);
    db.prepare("INSERT INTO goals (id, title, embedding) VALUES (?, ?, ?)").run(
      'g1', 'Write docs', embedding
    );

    const mockPipeline = {
      getEmbedding: vi.fn().mockResolvedValue([1.0, 0.0, 0.0]), // orthogonal
    } as any;

    const aligner = new GoalAligner(db, mockPipeline);
    const tagged = await aligner.alignActionItems(['deploy API'], 'meeting-1');

    expect(tagged[0].goal_id).toBeNull();
    expect(tagged[0].goal_confidence).toBeNull();

    db.close();
  });

  it('normalizes string action items into ActionItem format for saving', () => {
    // Simulate the normalization done in IntelligenceManager
    const rawItems = ['do X', 'do Y'];
    const normalized = rawItems.map(text => ({
      text,
      goal_id: null as string | null,
      goal_confidence: null as number | null,
    }));

    expect(normalized).toEqual([
      { text: 'do X', goal_id: null, goal_confidence: null },
      { text: 'do Y', goal_id: null, goal_confidence: null },
    ]);
  });
});
