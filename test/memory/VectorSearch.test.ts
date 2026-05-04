import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';

// Helper: encode number[] to Float32 Buffer (mirrors production code)
function encodeVector(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

describe('VectorSearch', () => {
  let db: Database.Database;
  let mm: MemoryManager;

  beforeEach(() => {
    MemoryManager.resetInstance();
    db = new Database(':memory:');
    // Bypass vecLoader for tests (sqlite-vec not available in vitest env)
    // runMigration is called inside MemoryManager constructor
    mm = MemoryManager.getInstance(db);
  });

  afterEach(() => {
    db.close();
    MemoryManager.resetInstance();
  });

  describe('storeFactEmbedding', () => {
    it('writes BLOB to memory_facts.embedding', () => {
      const node = mm.upsertNode('person', 'Alice');
      const fact = mm.upsertFact(node.id, 'role', 'engineer');
      const vec = Array.from({ length: 768 }, (_, i) => i / 768);

      mm.storeFactEmbedding(fact.id, vec);

      // The UPDATE for memory_facts should have been called
      const row = db.prepare('SELECT embedding FROM memory_facts WHERE id = ?').get(fact.id) as any;
      expect(row.embedding).toBeInstanceOf(Buffer);
      expect(row.embedding.length).toBe(768 * 4); // Float32: 4 bytes each
    });

    it('does not throw when vec0 table unavailable (sqlite-vec not loaded)', () => {
      const node = mm.upsertNode('topic', 'kubernetes');
      const fact = mm.upsertFact(node.id, 'description', 'container orchestration');
      const vec = Array.from({ length: 768 }, () => 0.1);
      // Should not throw even if memory_facts_vec doesn't exist
      expect(() => mm.storeFactEmbedding(fact.id, vec)).not.toThrow();
    });
  });

  describe('findSimilar', () => {
    it('returns empty array when vec0 unavailable (graceful degradation)', () => {
      const node = mm.upsertNode('person', 'Bob');
      mm.upsertFact(node.id, 'skill', 'TypeScript');
      const queryVec = Array.from({ length: 768 }, () => 0.5);
      // Without sqlite-vec loaded, memory_facts_vec doesn't exist -> should return []
      const results = mm.findSimilar(queryVec, 5);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('accepts optional kindFilter parameter without error', () => {
      const queryVec = Array.from({ length: 768 }, () => 0.1);
      expect(() => mm.findSimilar(queryVec, 3, 'person')).not.toThrow();
    });

    it('returns empty array for k=0', () => {
      const queryVec = Array.from({ length: 768 }, () => 0.1);
      const results = mm.findSimilar(queryVec, 0);
      expect(results).toEqual([]);
    });
  });
});
