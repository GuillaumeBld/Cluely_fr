import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { GoalRegistry } from '../../electron/services/GoalRegistry';
import { GoalAligner, EmbeddingProvider } from '../../electron/services/GoalAligner';
import { DecisionLedger } from '../../electron/services/DecisionLedger';
import { PostMeetingProcessor, DecisionExtractor, ExtractedDecision } from '../../electron/services/PostMeetingProcessor';
import { Decision } from '../../electron/memory/schema';

describe('PostMeetingProcessor', () => {
  let db: Database.Database;

  beforeEach(() => {
    GoalRegistry.resetInstance();
    GoalAligner.resetInstance();
    DecisionLedger.resetInstance();
    PostMeetingProcessor.resetInstance();
    db = new Database(':memory:');
    runMigration(db);
  });

  afterEach(() => {
    db.close();
    GoalRegistry.resetInstance();
    GoalAligner.resetInstance();
    DecisionLedger.resetInstance();
    PostMeetingProcessor.resetInstance();
  });

  it('extracts decisions from transcript and writes them to the ledger', async () => {
    const registry = GoalRegistry.getInstance(db);
    const goal = registry.create({ name: 'Product Launch' });
    registry.setEmbedding(goal.id, [1, 0, 0]);

    const embedder: EmbeddingProvider = {
      async embed(): Promise<number[]> {
        return [0.9, 0.1, 0]; // close to goal
      },
    };
    const aligner = GoalAligner.getInstance(registry, embedder);
    const ledger = DecisionLedger.getInstance(db);

    const extractor: DecisionExtractor = {
      async extractDecisions(): Promise<ExtractedDecision[]> {
        return [
          { text: 'We will launch the product next Monday', speaker: 'Alice', timestamp: '2026-04-30T10:05:00Z' },
          { text: 'Budget approved for marketing campaign', speaker: 'Bob', timestamp: '2026-04-30T10:12:00Z' },
        ];
      },
    };

    const processor = PostMeetingProcessor.getInstance(ledger, aligner, extractor);
    const count = await processor.run('mtg-100', 'fake transcript...');

    expect(count).toBe(2);

    const rows = db.prepare('SELECT * FROM decisions WHERE meeting_id = ?').all('mtg-100') as Decision[];
    expect(rows.length).toBe(2);
    expect(rows[0].speaker).toBe('Alice');
    expect(rows[1].speaker).toBe('Bob');
    expect(rows[0].goal_id).toBe(goal.id);
  });

  it('is idempotent on retry — does not double-write', async () => {
    const registry = GoalRegistry.getInstance(db);
    const embedder: EmbeddingProvider = { async embed() { return [0, 0, 0]; } };
    const aligner = GoalAligner.getInstance(registry, embedder);
    const ledger = DecisionLedger.getInstance(db);

    const extractor: DecisionExtractor = {
      async extractDecisions(): Promise<ExtractedDecision[]> {
        return [
          { text: 'Single decision', speaker: 'Eve', timestamp: '2026-04-30T11:00:00Z' },
        ];
      },
    };

    const processor = PostMeetingProcessor.getInstance(ledger, aligner, extractor);
    await processor.run('mtg-200', 'transcript');
    const secondCount = await processor.run('mtg-200', 'transcript');

    expect(secondCount).toBe(0); // duplicate ignored

    const rows = db.prepare('SELECT * FROM decisions WHERE meeting_id = ?').all('mtg-200') as Decision[];
    expect(rows.length).toBe(1);
  });
});
