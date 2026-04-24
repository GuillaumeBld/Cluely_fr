import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';

describe('MemoryManager — Conflict Resolution Extensions', () => {
  let db: Database.Database;
  let mm: MemoryManager;

  beforeEach(() => {
    MemoryManager.resetInstance();
    db = new Database(':memory:');
    mm = MemoryManager.getInstance(db);
  });

  afterEach(() => {
    db.close();
    MemoryManager.resetInstance();
  });

  describe('queryEntityFacts', () => {
    it('returns facts for an entity by label', () => {
      const node = mm.upsertNode('person', 'Luca');
      mm.upsertFact(node.id, 'role', 'backend dev', 1.0);
      mm.upsertFact(node.id, 'team', 'infra', 0.9);

      const facts = mm.queryEntityFacts('Luca');
      expect(facts).toHaveLength(2);
      expect(facts[0].node_label).toBe('Luca');
      expect(facts[0].node_kind).toBe('person');
    });

    it('returns empty array for unknown entity', () => {
      const facts = mm.queryEntityFacts('Nobody');
      expect(facts).toHaveLength(0);
    });
  });

  describe('updateFactValue', () => {
    it('updates fact value and records resolution', () => {
      const node = mm.upsertNode('person', 'Luca');
      const fact = mm.upsertFact(node.id, 'role', 'backend dev', 1.0);

      const resolution = mm.updateFactValue(fact.id, 'API lead', 'update', 'meeting-42');

      expect(resolution.old_value).toBe('backend dev');
      expect(resolution.new_value).toBe('API lead');
      expect(resolution.action).toBe('update');
      expect(resolution.meeting_id).toBe('meeting-42');

      // Verify fact was actually updated
      const facts = mm.getFacts(node.id);
      expect(facts[0].value).toBe('API lead');
    });

    it('records resolution without changing value on ignore', () => {
      const node = mm.upsertNode('person', 'Luca');
      const fact = mm.upsertFact(node.id, 'role', 'backend dev', 1.0);

      const resolution = mm.updateFactValue(fact.id, 'API lead', 'ignore');
      expect(resolution.action).toBe('ignore');

      // Fact should remain unchanged
      const facts = mm.getFacts(node.id);
      expect(facts[0].value).toBe('backend dev');
    });

    it('throws on nonexistent fact', () => {
      expect(() => mm.updateFactValue(999, 'x', 'update')).toThrow('Fact 999 not found');
    });
  });

  describe('pending conflicts queue', () => {
    it('enqueues and retrieves pending conflicts', () => {
      mm.enqueuePendingConflict('m1', 'Luca', 'role', 'dev', 'lead', 'Marie');

      const pending = mm.getPendingConflicts('m1');
      expect(pending).toHaveLength(1);
      expect(pending[0].entity).toBe('Luca');
      expect(pending[0].old_value).toBe('dev');
      expect(pending[0].new_value).toBe('lead');
    });

    it('resolves a pending conflict', () => {
      const pc = mm.enqueuePendingConflict('m1', 'Luca', 'role', 'dev', 'lead');
      mm.resolvePendingConflict(pc.id);

      const pending = mm.getPendingConflicts('m1');
      expect(pending).toHaveLength(0);
    });

    it('filters by meeting ID', () => {
      mm.enqueuePendingConflict('m1', 'Luca', 'role', 'dev', 'lead');
      mm.enqueuePendingConflict('m2', 'Bob', 'team', 'a', 'b');

      expect(mm.getPendingConflicts('m1')).toHaveLength(1);
      expect(mm.getPendingConflicts('m2')).toHaveLength(1);
      expect(mm.getPendingConflicts()).toHaveLength(2);
    });
  });

  describe('getConflictResolutions', () => {
    it('returns resolutions for a meeting', () => {
      const node = mm.upsertNode('person', 'Luca');
      const fact = mm.upsertFact(node.id, 'role', 'dev', 1.0);
      mm.updateFactValue(fact.id, 'lead', 'update', 'meeting-42');

      const resolutions = mm.getConflictResolutions('meeting-42');
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].old_value).toBe('dev');
      expect(resolutions[0].new_value).toBe('lead');
    });

    it('returns empty for meeting with no resolutions', () => {
      const resolutions = mm.getConflictResolutions('no-meeting');
      expect(resolutions).toHaveLength(0);
    });
  });
});
