import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { getCommitmentsInRange } from '../../electron/memory/DecisionQuery';

describe('getCommitmentsInRange', () => {
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

  it('returns only commitment predicates (agreed_with, owes, decided)', () => {
    const alice = mm.upsertNode('person', 'Alice');
    const bob = mm.upsertNode('person', 'Bob');
    const topic = mm.upsertNode('topic', 'GraphQL');

    // Commitment edges
    mm.proposeEdge(alice.id, bob.id, 'agreed_with', 0.9, 'meeting-1');
    mm.proposeEdge(bob.id, alice.id, 'owes', 0.8, 'meeting-1');

    // Non-commitment edge
    mm.proposeEdge(alice.id, topic.id, 'discussed', 0.95, 'meeting-1');

    const rows = getCommitmentsInRange(db, 30);
    expect(rows.length).toBe(2);
    expect(rows.every(r => ['agreed_with', 'owes', 'decided'].includes(r.predicate))).toBe(true);
  });

  it('returns zero prose — only structured rows with meeting_id, predicate, etc.', () => {
    const alice = mm.upsertNode('person', 'Alice');
    const bob = mm.upsertNode('person', 'Bob');
    mm.proposeEdge(alice.id, bob.id, 'decided', 0.85, 'meeting-2');

    const rows = getCommitmentsInRange(db, 30);
    expect(rows.length).toBe(1);

    const row = rows[0];
    expect(row).toHaveProperty('edge_id');
    expect(row).toHaveProperty('meeting_id');
    expect(row).toHaveProperty('source_label');
    expect(row).toHaveProperty('target_label');
    expect(row).toHaveProperty('predicate');
    expect(row).toHaveProperty('weight');
    expect(row).toHaveProperty('created_at');
    expect(row.meeting_id).toBe('meeting-2');
    expect(row.source_label).toBe('Alice');
    expect(row.target_label).toBe('Bob');
  });

  it('excludes edges older than the range', () => {
    const alice = mm.upsertNode('person', 'Alice');
    const bob = mm.upsertNode('person', 'Bob');
    mm.proposeEdge(alice.id, bob.id, 'agreed_with', 0.9);

    // Backdate the edge to 60 days ago
    db.prepare("UPDATE memory_edges SET created_at = datetime('now', '-60 days')").run();

    const rows = getCommitmentsInRange(db, 30);
    expect(rows.length).toBe(0);
  });
});
