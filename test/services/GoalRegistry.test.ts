import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { GoalRegistry, serializeEmbedding } from '../../electron/services/GoalRegistry';

describe('GoalRegistry', () => {
  let db: Database.Database;
  let registry: GoalRegistry;

  beforeEach(() => {
    GoalRegistry.resetInstance();
    db = new Database(':memory:');
    runMigration(db);
    registry = GoalRegistry.getInstance(db);
  });

  afterEach(() => {
    db.close();
    GoalRegistry.resetInstance();
  });

  describe('create', () => {
    it('inserts a goal and returns it with an id', () => {
      const goal = registry.create({ name: 'Archon Release', description: 'Ship v1' });
      expect(goal.id).toBe(1);
      expect(goal.name).toBe('Archon Release');
      expect(goal.description).toBe('Ship v1');
      expect(goal.created_at).toBeTruthy();
    });
  });

  describe('list', () => {
    it('returns all goals', () => {
      registry.create({ name: 'Goal A' });
      registry.create({ name: 'Goal B' });
      const goals = registry.list();
      expect(goals.length).toBe(2);
    });
  });

  describe('getById', () => {
    it('returns goal by id', () => {
      const created = registry.create({ name: 'Test Goal' });
      const found = registry.getById(created.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Test Goal');
    });

    it('returns undefined for missing id', () => {
      expect(registry.getById(999)).toBeUndefined();
    });
  });

  describe('findByEmbedding', () => {
    it('returns the closest goal by cosine similarity', () => {
      const g1 = registry.create({ name: 'Archon Release' });
      const g2 = registry.create({ name: 'Unrelated Project' });

      // Set embeddings: g1 close to query, g2 far
      registry.setEmbedding(g1.id, [1, 0, 0]);
      registry.setEmbedding(g2.id, [0, 1, 0]);

      const result = registry.findByEmbedding([0.9, 0.1, 0]);
      expect(result).toBeDefined();
      expect(result!.goal.id).toBe(g1.id);
      expect(result!.similarity).toBeGreaterThan(0.9);
    });

    it('returns undefined when no goals have embeddings', () => {
      registry.create({ name: 'No Embedding' });
      expect(registry.findByEmbedding([1, 0, 0])).toBeUndefined();
    });
  });

  describe('setEmbedding', () => {
    it('stores and retrieves an embedding', () => {
      const goal = registry.create({ name: 'Test' });
      registry.setEmbedding(goal.id, [0.5, 0.5, 0.5]);
      const updated = registry.getById(goal.id);
      expect(updated!.embedding).not.toBeNull();
    });
  });
});
