import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { ConflictDetector } from '../../electron/memory/ConflictDetector';
import { RecapLLM } from '../../electron/llm/RecapLLM';

describe('Conflict Detection — End-to-End Integration', () => {
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

  it('full pipeline: detect → resolve → recap digest', async () => {
    // 1. Seed graph: Luca owns API work
    const luca = mm.upsertNode('person', 'Luca');
    mm.upsertFact(luca.id, 'owner', 'API work', 1.0, 'meeting-1');

    // 2. Mock LLM: transcript says Marie now owns API work
    const mockLlm = async () => JSON.stringify([
      { entity: 'Luca', relation: 'owner', value: 'frontend work', speaker: 'Marie', confidence: 0.9 },
    ]);

    // 3. Run conflict detection
    const result = await detector.run('Marie said Luca will own frontend work instead of API work', 'meeting-2', mockLlm);

    expect(result.surfaced).toHaveLength(1);
    expect(result.surfaced[0].oldValue).toBe('API work');
    expect(result.surfaced[0].newValue).toBe('frontend work');
    expect(result.queued).toHaveLength(0);

    // 4. Resolve the conflict (user chooses "update")
    const conflict = result.surfaced[0];
    const resolution = mm.updateFactValue(
      conflict.factId,
      conflict.newValue,
      'update',
      'meeting-2',
    );

    expect(resolution.action).toBe('update');

    // 5. Verify fact was updated in graph
    const facts = mm.getFacts(luca.id);
    expect(facts.find(f => f.key === 'owner')?.value).toBe('frontend work');

    // 6. Generate recap with conflict digest
    const recap = new RecapLLM(null as any);
    const resolutions = mm.getConflictResolutions('meeting-2');
    const summary = recap.appendConflictDigest('Meeting recap here.', resolutions);

    expect(summary).toContain('## Memory Conflicts Resolved');
    expect(summary).toContain('"API work" → "frontend work" (Updated)');
  });

  it('false positive: same entity discussed in different context is not a conflict', async () => {
    // Luca has role "backend dev"
    const luca = mm.upsertNode('person', 'Luca');
    mm.upsertFact(luca.id, 'role', 'backend dev', 1.0);

    // Transcript discusses Luca's team (different relation), not role
    const mockLlm = async () => JSON.stringify([
      { entity: 'Luca', relation: 'team', value: 'platform', speaker: null, confidence: 0.9 },
    ]);

    const result = await detector.run('Luca moved to platform team', 'meeting-3', mockLlm);
    expect(result.surfaced).toHaveLength(0);
  });

  it('rate limiter caps at 2 surfaced, queues rest', async () => {
    const node = mm.upsertNode('person', 'Alice');
    mm.upsertFact(node.id, 'role', 'dev', 1.0);
    mm.upsertFact(node.id, 'team', 'alpha', 1.0);
    mm.upsertFact(node.id, 'location', 'NYC', 1.0);

    const mockLlm = async () => JSON.stringify([
      { entity: 'Alice', relation: 'role', value: 'manager', speaker: null, confidence: 0.9 },
      { entity: 'Alice', relation: 'team', value: 'beta', speaker: null, confidence: 0.85 },
      { entity: 'Alice', relation: 'location', value: 'SF', speaker: null, confidence: 0.8 },
    ]);

    const result = await detector.run('transcript', 'meeting-4', mockLlm);

    expect(result.surfaced).toHaveLength(2);
    expect(result.queued).toHaveLength(1);

    // Queued conflict is persisted
    const pending = mm.getPendingConflicts('meeting-4');
    expect(pending).toHaveLength(1);
    expect(pending[0].resolved_at).toBeNull();
  });

  it('recap includes empty section when no conflicts', () => {
    const recap = new RecapLLM(null as any);
    const summary = recap.appendConflictDigest('Meeting notes.', []);
    expect(summary).toContain('## Memory Conflicts Resolved');
    expect(summary).toContain('No memory conflicts detected.');
  });
});
