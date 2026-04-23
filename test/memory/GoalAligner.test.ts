import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { GoalAligner, cosineSimilarity, decodeBlobToVector } from '../../electron/memory/GoalAligner';

// Helper: encode a number[] to the BLOB format used in the goals table
function encodeVector(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

describe('GoalAligner', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigration(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
    });

    it('returns 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });
  });

  describe('decodeBlobToVector', () => {
    it('round-trips a vector through encode/decode', () => {
      const vec = [0.1, 0.2, 0.3, 0.4];
      const buf = encodeVector(vec);
      const decoded = decodeBlobToVector(buf);
      for (let i = 0; i < vec.length; i++) {
        expect(decoded[i]).toBeCloseTo(vec[i], 5);
      }
    });
  });

  describe('alignActionItems', () => {
    it('tags items with matching goals above threshold', async () => {
      // Insert 3 goals with known embeddings
      // Goal 1: mostly [1, 0, 0] direction
      // Goal 2: mostly [0, 1, 0] direction
      // Goal 3: mostly [0, 0, 1] direction
      db.prepare("INSERT INTO goals (id, title, embedding) VALUES (?, ?, ?)").run(
        'g1', 'Deploy RAG', encodeVector([0.9, 0.1, 0.0])
      );
      db.prepare("INSERT INTO goals (id, title, embedding) VALUES (?, ?, ?)").run(
        'g2', 'Fix bugs', encodeVector([0.0, 0.9, 0.1])
      );
      db.prepare("INSERT INTO goals (id, title, embedding) VALUES (?, ?, ?)").run(
        'g3', 'Write docs', encodeVector([0.1, 0.0, 0.9])
      );

      // Mock EmbeddingPipeline
      const mockPipeline = {
        getEmbedding: vi.fn()
          .mockResolvedValueOnce([0.95, 0.05, 0.0])  // very close to g1 → should match
          .mockResolvedValueOnce([0.05, 0.95, 0.05])  // very close to g2 → should match
          .mockResolvedValueOnce([0.4, 0.4, 0.4]),    // equidistant → below threshold
      } as any;

      const aligner = new GoalAligner(db, mockPipeline);
      const result = await aligner.alignActionItems(
        ['index the repo', 'fix login crash', 'something vague'],
        'meeting-1'
      );

      expect(result).toHaveLength(3);

      // Item 0: high similarity to g1
      expect(result[0].goal_id).toBe('g1');
      expect(result[0].goal_confidence).toBeGreaterThan(0.65);

      // Item 1: high similarity to g2
      expect(result[1].goal_id).toBe('g2');
      expect(result[1].goal_confidence).toBeGreaterThan(0.65);

      // Item 2: below threshold → null
      expect(result[2].goal_id).toBeNull();
      expect(result[2].goal_confidence).toBeNull();
    });

    it('returns all null when goals table is empty', async () => {
      const mockPipeline = { getEmbedding: vi.fn() } as any;
      const aligner = new GoalAligner(db, mockPipeline);

      const result = await aligner.alignActionItems(
        ['do X', 'do Y'],
        'meeting-1'
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'do X', goal_id: null, goal_confidence: null });
      expect(result[1]).toEqual({ text: 'do Y', goal_id: null, goal_confidence: null });

      // Should NOT call getEmbedding when no goals exist
      expect(mockPipeline.getEmbedding).not.toHaveBeenCalled();
    });

    it('skips completed goals', async () => {
      db.prepare(
        "INSERT INTO goals (id, title, embedding, completed_at) VALUES (?, ?, ?, unixepoch())"
      ).run('g1', 'Done goal', encodeVector([0.9, 0.1, 0.0]));

      const mockPipeline = { getEmbedding: vi.fn() } as any;
      const aligner = new GoalAligner(db, mockPipeline);

      const result = await aligner.alignActionItems(['task'], 'meeting-1');
      expect(result[0].goal_id).toBeNull();
      expect(mockPipeline.getEmbedding).not.toHaveBeenCalled();
    });
  });
});
