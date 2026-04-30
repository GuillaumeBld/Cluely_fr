import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { GoalRegistry } from '../../electron/services/GoalRegistry';
import { GoalAligner, EmbeddingProvider } from '../../electron/services/GoalAligner';

/** Mock embedder that returns a deterministic vector based on text content. */
function mockEmbedder(mappings: Record<string, number[]>): EmbeddingProvider {
  return {
    async embed(text: string): Promise<number[]> {
      return mappings[text] ?? [0, 0, 0];
    },
  };
}

describe('GoalAligner', () => {
  let db: Database.Database;
  let registry: GoalRegistry;

  beforeEach(() => {
    GoalRegistry.resetInstance();
    GoalAligner.resetInstance();
    db = new Database(':memory:');
    runMigration(db);
    registry = GoalRegistry.getInstance(db);
  });

  afterEach(() => {
    db.close();
    GoalRegistry.resetInstance();
    GoalAligner.resetInstance();
  });

  it('returns goal_id when similarity is above threshold', async () => {
    const goal = registry.create({ name: 'Archon Release' });
    registry.setEmbedding(goal.id, [1, 0, 0]);

    const embedder = mockEmbedder({
      'Write unit tests for the dispatcher': [0.95, 0.1, 0],
    });
    const aligner = GoalAligner.getInstance(registry, embedder);

    const goalId = await aligner.align('Write unit tests for the dispatcher');
    expect(goalId).toBe(goal.id);
  });

  it('returns null when no goal matches above threshold', async () => {
    const goal = registry.create({ name: 'Archon Release' });
    registry.setEmbedding(goal.id, [1, 0, 0]);

    // Orthogonal vector — similarity near 0
    const embedder = mockEmbedder({
      'Completely unrelated text': [0, 0, 1],
    });
    const aligner = GoalAligner.getInstance(registry, embedder);

    const goalId = await aligner.align('Completely unrelated text');
    expect(goalId).toBeNull();
  });

  it('returns null when no goals have embeddings', async () => {
    registry.create({ name: 'No Embedding Goal' });

    const embedder = mockEmbedder({ 'some text': [1, 0, 0] });
    const aligner = GoalAligner.getInstance(registry, embedder);

    const goalId = await aligner.align('some text');
    expect(goalId).toBeNull();
  });

  it('returns null (no exception) when embedder throws', async () => {
    const goal = registry.create({ name: 'Test' });
    registry.setEmbedding(goal.id, [1, 0, 0]);

    const failingEmbedder: EmbeddingProvider = {
      async embed(): Promise<number[]> {
        throw new Error('API down');
      },
    };
    const aligner = GoalAligner.getInstance(registry, failingEmbedder);

    const goalId = await aligner.align('anything');
    expect(goalId).toBeNull();
  });
});
