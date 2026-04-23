import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { ConflictDetector, ExtractedTriple } from '../../electron/memory/ConflictDetector';

describe('ConflictDetector', () => {
  let db: Database.Database;
  let mm: MemoryManager;
  let detector: ConflictDetector;

  beforeEach(() => {
    MemoryManager.resetInstance();
    db = new Database(':memory:');
    mm = MemoryManager.getInstance(db);
    detector = new ConflictDetector(mm);
  });

  afterEach(() => {
    db.close();
    MemoryManager.resetInstance();
  });

  describe('extractTriples', () => {
    it('parses valid LLM response into triples', async () => {
      const mockLlm = async () => JSON.stringify([
        { entity: 'Luca', relation: 'role', value: 'API lead', speaker: 'Marie', confidence: 0.9 },
      ]);

      const triples = await detector.extractTriples('test transcript', mockLlm);
      expect(triples).toHaveLength(1);
      expect(triples[0].entity).toBe('Luca');
      expect(triples[0].relation).toBe('role');
      expect(triples[0].value).toBe('API lead');
    });

    it('returns empty array on invalid JSON', async () => {
      const mockLlm = async () => 'not valid json';
      const triples = await detector.extractTriples('test', mockLlm);
      expect(triples).toHaveLength(0);
    });

    it('returns empty array on LLM error', async () => {
      const mockLlm = async () => { throw new Error('LLM down'); };
      const triples = await detector.extractTriples('test', mockLlm);
      expect(triples).toHaveLength(0);
    });

    it('filters out triples with missing required fields', async () => {
      const mockLlm = async () => JSON.stringify([
        { entity: 'Luca', relation: 'role', value: 'lead', speaker: null, confidence: 0.9 },
        { entity: '', relation: 'role', value: 'lead', speaker: null, confidence: 0.9 },
        { entity: 'Bob', relation: 'role', value: 'dev', speaker: null, confidence: 'high' },
      ]);
      const triples = await detector.extractTriples('test', mockLlm);
      expect(triples).toHaveLength(1);
      expect(triples[0].entity).toBe('Luca');
    });
  });

  describe('detectConflicts', () => {
    it('detects conflict when same entity+relation has different value', () => {
      const node = mm.upsertNode('person', 'Luca');
      mm.upsertFact(node.id, 'role', 'backend dev', 1.0, 'meeting-1');

      const newTriples: ExtractedTriple[] = [
        { entity: 'Luca', relation: 'role', value: 'API lead', speaker: 'Marie', confidence: 0.9 },
      ];

      const conflicts = detector.detectConflicts(newTriples);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].oldValue).toBe('backend dev');
      expect(conflicts[0].newValue).toBe('API lead');
      expect(conflicts[0].speaker).toBe('Marie');
    });

    it('does not flag conflict when values match', () => {
      const node = mm.upsertNode('person', 'Luca');
      mm.upsertFact(node.id, 'role', 'API lead', 1.0);

      const newTriples: ExtractedTriple[] = [
        { entity: 'Luca', relation: 'role', value: 'API lead', speaker: null, confidence: 0.9 },
      ];

      const conflicts = detector.detectConflicts(newTriples);
      expect(conflicts).toHaveLength(0);
    });

    it('does not flag conflict when entity does not exist in graph', () => {
      const newTriples: ExtractedTriple[] = [
        { entity: 'Unknown', relation: 'role', value: 'dev', speaker: null, confidence: 0.9 },
      ];

      const conflicts = detector.detectConflicts(newTriples);
      expect(conflicts).toHaveLength(0);
    });

    it('does not flag conflict for different relations on same entity', () => {
      const node = mm.upsertNode('person', 'Luca');
      mm.upsertFact(node.id, 'role', 'backend dev', 1.0);

      const newTriples: ExtractedTriple[] = [
        { entity: 'Luca', relation: 'team', value: 'platform', speaker: null, confidence: 0.9 },
      ];

      const conflicts = detector.detectConflicts(newTriples);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('run (full pipeline)', () => {
    it('surfaces up to 2 conflicts and queues overflow', async () => {
      // Seed graph with 3 facts for Luca
      const node = mm.upsertNode('person', 'Luca');
      mm.upsertFact(node.id, 'role', 'backend dev', 1.0);
      mm.upsertFact(node.id, 'team', 'infra', 1.0);
      mm.upsertFact(node.id, 'location', 'Paris', 1.0);

      // Mock LLM returns 3 contradicting triples
      const mockLlm = async () => JSON.stringify([
        { entity: 'Luca', relation: 'role', value: 'API lead', speaker: 'Marie', confidence: 0.9 },
        { entity: 'Luca', relation: 'team', value: 'platform', speaker: 'Marie', confidence: 0.85 },
        { entity: 'Luca', relation: 'location', value: 'London', speaker: 'Marie', confidence: 0.8 },
      ]);

      const result = await detector.run('transcript', 'meeting-42', mockLlm);

      expect(result.surfaced).toHaveLength(2);
      expect(result.queued).toHaveLength(1);

      // Verify overflow is persisted in pending_conflicts
      const pending = mm.getPendingConflicts('meeting-42');
      expect(pending).toHaveLength(1);
      expect(pending[0].entity).toBe('Luca');
    });

    it('returns empty result when no conflicts found', async () => {
      const mockLlm = async () => JSON.stringify([
        { entity: 'NewPerson', relation: 'role', value: 'dev', speaker: null, confidence: 0.9 },
      ]);

      const result = await detector.run('transcript', 'meeting-1', mockLlm);
      expect(result.surfaced).toHaveLength(0);
      expect(result.queued).toHaveLength(0);
    });
  });
});
