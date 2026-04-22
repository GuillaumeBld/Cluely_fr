import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';

describe('MemoryManager', () => {
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

  // ─── Nodes ───────────────────────────────────────────────────────

  describe('upsertNode', () => {
    it('creates a new node', () => {
      const node = mm.upsertNode('person', 'Alice');
      expect(node.id).toBeTruthy();
      expect(node.kind).toBe('person');
      expect(node.label).toBe('Alice');
    });

    it('returns existing node on duplicate kind+label', () => {
      const n1 = mm.upsertNode('person', 'Alice');
      const n2 = mm.upsertNode('person', 'Alice', { role: 'engineer' });
      expect(n2.id).toBe(n1.id);
    });

    it('finds nodes by kind', () => {
      mm.upsertNode('person', 'Alice');
      mm.upsertNode('topic', 'GraphQL');
      const people = mm.findNodes('person');
      expect(people.length).toBe(1);
      expect(people[0].label).toBe('Alice');
    });
  });

  // ─── Edges (confidence gating) ──────────────────────────────────

  describe('proposeEdge', () => {
    it('stores high-confidence proposal as edge', () => {
      const a = mm.upsertNode('person', 'Alice');
      const b = mm.upsertNode('person', 'Bob');
      const result = mm.proposeEdge(a.id, b.id, 'knows', 0.9);
      expect(result.stored).toBe('edge');

      const edges = mm.getEdgesFrom(a.id);
      expect(edges.length).toBe(1);
      expect(edges[0].predicate).toBe('knows');
    });

    it('stores low-confidence proposal in pending_review (0.65 < 0.7)', () => {
      const a = mm.upsertNode('person', 'Alice');
      const b = mm.upsertNode('topic', 'Budget');
      const result = mm.proposeEdge(a.id, b.id, 'agreed_with', 0.65, null, 'maybe they agreed');
      expect(result.stored).toBe('pending');

      const edges = mm.getEdgesFrom(a.id);
      expect(edges.length).toBe(0);

      const pending = mm.getPendingReview();
      expect(pending.length).toBe(1);
      expect(pending[0].confidence).toBe(0.65);
    });

    it('confidence exactly at 0.7 is stored as edge', () => {
      const a = mm.upsertNode('person', 'Alice');
      const b = mm.upsertNode('person', 'Bob');
      const result = mm.proposeEdge(a.id, b.id, 'knows', 0.7);
      expect(result.stored).toBe('edge');
    });
  });

  // ─── Facts ───────────────────────────────────────────────────────

  describe('upsertFact', () => {
    it('creates a new fact', () => {
      const node = mm.upsertNode('person', 'Alice');
      const fact = mm.upsertFact(node.id, 'email', 'alice@example.com');
      expect(fact.key).toBe('email');
      expect(fact.value).toBe('alice@example.com');
      expect(fact.confidence).toBe(1.0);
    });

    it('updates existing fact on same node+key', () => {
      const node = mm.upsertNode('person', 'Alice');
      mm.upsertFact(node.id, 'email', 'old@example.com');
      const updated = mm.upsertFact(node.id, 'email', 'new@example.com');
      expect(updated.value).toBe('new@example.com');

      const facts = mm.getFacts(node.id);
      expect(facts.length).toBe(1);
    });
  });

  // ─── Confidence Decay ────────────────────────────────────────────

  describe('decayFacts', () => {
    it('decays a fact last updated 60 days ago to ≤ 0.5× original', () => {
      const node = mm.upsertNode('person', 'Alice');
      mm.upsertFact(node.id, 'role', 'engineer', 1.0);

      // Manually backdated updated_at to 60 days ago
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(sixtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      mm.decayFacts();

      const facts = mm.getFacts(node.id);
      expect(facts[0].confidence).toBeLessThanOrEqual(0.5);
      // With half-life=30 days, 60 days → 2 half-lives → 0.25
      expect(facts[0].confidence).toBeCloseTo(0.25, 1);
    });

    it('does not decay recently updated facts significantly', () => {
      const node = mm.upsertNode('person', 'Bob');
      mm.upsertFact(node.id, 'team', 'infra', 1.0);

      mm.decayFacts();

      const facts = mm.getFacts(node.id);
      // Just created, so decay should be negligible
      expect(facts[0].confidence).toBeGreaterThan(0.95);
    });
  });

  // ─── Pending Review ──────────────────────────────────────────────

  describe('resolveReview', () => {
    it('approved review creates an edge', () => {
      const a = mm.upsertNode('person', 'Alice');
      const b = mm.upsertNode('person', 'Bob');
      const { id } = mm.proposeEdge(a.id, b.id, 'owes', 0.5, null, 'low confidence');

      mm.resolveReview(id, true);

      const edges = mm.getEdgesFrom(a.id);
      expect(edges.length).toBe(1);
      expect(edges[0].predicate).toBe('owes');
    });

    it('rejected review does not create an edge', () => {
      const a = mm.upsertNode('person', 'Alice');
      const b = mm.upsertNode('person', 'Bob');
      const { id } = mm.proposeEdge(a.id, b.id, 'owes', 0.5);

      mm.resolveReview(id, false);

      const edges = mm.getEdgesFrom(a.id);
      expect(edges.length).toBe(0);
    });
  });
});
