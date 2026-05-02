import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { HALF_LIFE_DAYS } from '../../electron/memory/schema';

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

    it('decays with a custom halfLifeDays parameter', () => {
      const node = mm.upsertNode('person', 'Carol');
      mm.upsertFact(node.id, 'role', 'designer', 1.0);

      // Backdate to 14 days ago
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(fourteenDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      // 7-day half-life: after 14 days → 2 half-lives → confidence × 0.25
      mm.decayFacts(7);

      const facts = mm.getFacts(node.id);
      expect(facts[0].confidence).toBeCloseTo(0.25, 1);
    });
  });

  // ─── getFacts with halfLifeDays ─────────────────────────────────

  describe('getFacts with halfLifeDays', () => {
    it('returns decayed confidence when halfLifeDays is provided', () => {
      const node = mm.upsertNode('person', 'Dave');
      mm.upsertFact(node.id, 'team', 'platform', 1.0);

      // Backdate to 30 days ago
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      // 30-day half-life: 30 days → 1 half-life → confidence × 0.5
      const facts = mm.getFacts(node.id, 30);
      expect(facts[0].confidence).toBeCloseTo(0.5, 1);
    });

    it('does not mutate stored confidence when using retrieval-time decay', () => {
      const node = mm.upsertNode('person', 'Eve');
      mm.upsertFact(node.id, 'status', 'active', 0.9);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      // Call with half-life decay
      mm.getFacts(node.id, 30);

      // Verify stored confidence is unchanged
      const storedFacts = mm.getFacts(node.id);
      expect(storedFacts[0].confidence).toBeCloseTo(0.9, 5);
    });

    it('returns original confidence when halfLifeDays is omitted', () => {
      const node = mm.upsertNode('person', 'Frank');
      mm.upsertFact(node.id, 'role', 'manager', 0.8);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      const facts = mm.getFacts(node.id);
      expect(facts[0].confidence).toBeCloseTo(0.8, 5);
    });
  });

  // ─── queryEntityFacts with halfLifeDays ─────────────────────────

  describe('queryEntityFacts with halfLifeDays', () => {
    it('returns decayed confidence when halfLifeDays is provided', () => {
      const node = mm.upsertNode('person', 'Grace');
      mm.upsertFact(node.id, 'title', 'Lead', 1.0);

      // Backdate to 30 days ago (1 half-life)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      // 30-day half-life: 30 days → 1 half-life → confidence × 0.5
      const facts = mm.queryEntityFacts('Grace', 30);
      expect(facts[0].confidence).toBeCloseTo(0.5, 1);
    });

    it('does not mutate stored confidence when using retrieval-time decay', () => {
      const node = mm.upsertNode('person', 'Heidi');
      mm.upsertFact(node.id, 'dept', 'Engineering', 0.9);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      mm.queryEntityFacts('Heidi', 30); // retrieval with decay

      // Stored value must remain unchanged
      const stored = mm.queryEntityFacts('Heidi'); // no halfLifeDays
      expect(stored[0].confidence).toBeCloseTo(0.9, 5);
    });

    it('returns original confidence when halfLifeDays is omitted', () => {
      const node = mm.upsertNode('person', 'Ivan');
      mm.upsertFact(node.id, 'role', 'analyst', 0.75);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      const facts = mm.queryEntityFacts('Ivan');
      expect(facts[0].confidence).toBeCloseTo(0.75, 5);
    });
  });

  // ─── getFacts — halfLifeDays boundary guards ─────────────────────

  describe('getFacts — halfLifeDays boundary guards', () => {
    it('returns original facts when halfLifeDays is 0', () => {
      const node = mm.upsertNode('person', 'Judy');
      mm.upsertFact(node.id, 'role', 'tester', 0.8);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      // halfLifeDays = 0 → guard triggers → original confidence returned
      const facts = mm.getFacts(node.id, 0);
      expect(facts[0].confidence).toBeCloseTo(0.8, 5);
    });

    it('returns original facts when halfLifeDays is negative', () => {
      const node = mm.upsertNode('person', 'Karl');
      mm.upsertFact(node.id, 'role', 'devops', 0.7);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      const facts = mm.getFacts(node.id, -10);
      expect(facts[0].confidence).toBeCloseTo(0.7, 5);
    });
  });

  // ─── getFacts — invalid updated_at handling ──────────────────────

  describe('getFacts — invalid updated_at handling', () => {
    it('returns fact unchanged when updated_at is not a valid date string', () => {
      const node = mm.upsertNode('person', 'Lena');
      mm.upsertFact(node.id, 'role', 'pm', 0.9);

      // Inject a malformed timestamp directly into the DB
      db.prepare("UPDATE memory_facts SET updated_at = 'not-a-date' WHERE node_id = ?")
        .run(node.id);

      // Should not throw; invalid row is returned as-is
      const facts = mm.getFacts(node.id, 30);
      expect(facts).toHaveLength(1);
      expect(facts[0].confidence).toBe(0.9); // original, not NaN
    });
  });

  // ─── getFacts — future timestamp guard ───────────────────────────

  describe('getFacts — future timestamp guard', () => {
    it('returns fact unchanged when updated_at is in the future', () => {
      const node = mm.upsertNode('person', 'Marco');
      mm.upsertFact(node.id, 'role', 'cto', 1.0);

      // Set updated_at one year in the future
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(future.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      // daysSinceUpdate < 0 → guard triggers → confidence untouched
      const facts = mm.getFacts(node.id, 30);
      expect(facts[0].confidence).toBeCloseTo(1.0, 5);
    });
  });

  // ─── decayFacts — halfLifeDays <= 0 guard ────────────────────────

  describe('decayFacts — halfLifeDays <= 0 guard', () => {
    it('returns 0 and skips decay when halfLifeDays is 0', () => {
      const node = mm.upsertNode('person', 'Nora');
      mm.upsertFact(node.id, 'role', 'designer', 0.8);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      const updated = mm.decayFacts(0);
      expect(updated).toBe(0); // no rows written

      // Stored confidence must be unchanged
      const facts = mm.getFacts(node.id);
      expect(facts[0].confidence).toBeCloseTo(0.8, 5);
    });

    it('returns 0 and skips decay when halfLifeDays is negative', () => {
      const node = mm.upsertNode('person', 'Oscar');
      mm.upsertFact(node.id, 'role', 'engineer', 0.9);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.prepare("UPDATE memory_facts SET updated_at = ? WHERE node_id = ?")
        .run(thirtyDaysAgo.toISOString().replace('T', ' ').replace('Z', ''), node.id);

      const updated = mm.decayFacts(-5);
      expect(updated).toBe(0);

      const facts = mm.getFacts(node.id);
      expect(facts[0].confidence).toBeCloseTo(0.9, 5);
    });
  });

  // ─── HALF_LIFE_DAYS constant ──────────────────────────────────────

  describe('HALF_LIFE_DAYS constant', () => {
    it('is exported with the canonical value of 30 days', () => {
      expect(HALF_LIFE_DAYS).toBe(30);
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

  // ─── Singleton identity ──────────────────────────────────────────

  describe('getInstance singleton', () => {
    it('returns the same instance on repeated calls', () => {
      const mm2 = MemoryManager.getInstance();
      expect(mm2).toBe(mm);
    });

    it('ignores db argument when instance already exists', () => {
      const db2 = new Database(':memory:');
      const mm2 = MemoryManager.getInstance(db2);
      expect(mm2).toBe(mm);
      db2.close();
    });

    it('isDegraded returns false for a healthy in-memory instance', () => {
      expect(mm.isDegraded()).toBe(false);
    });
  });

  // ─── isDegraded fallback ─────────────────────────────────────────

  describe('isDegraded fallback', () => {
    it('returns isDegraded=true when opened with an invalid path', () => {
      MemoryManager.resetInstance();
      // Pass a path that cannot be opened (directory instead of file)
      const degraded = MemoryManager.getInstance('/');
      expect(degraded.isDegraded()).toBe(true);
      MemoryManager.resetInstance();
    });
  });
});
