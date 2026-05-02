import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { runMigration } from '../../electron/memory/migration';
import { RecapLLM } from '../../electron/llm/RecapLLM';

describe('RecapLLM.appendConflictDigest — conflict digest section formatting', () => {
  it('appends resolved conflicts for given meetingId', async () => {
    const db = new Database(':memory:');
    runMigration(db);
    MemoryManager.resetInstance();
    const mm = MemoryManager.getInstance(db);

    // Seed a conflict resolution
    const node = mm.upsertNode('person', 'Alice');
    mm.upsertFact(node.id, 'role', 'engineer', 1.0, 'mtg-abc');
    mm.updateFactValue(
      mm.getFacts(node.id)[0].id,
      'tech lead',
      'update',
      'mtg-abc',
    );

    // Verify digest output directly (appendConflictDigest is the unit under test)
    const recap = new RecapLLM(null as any);
    const resolutions = mm.getConflictResolutions('mtg-abc');
    const result = recap.appendConflictDigest('Weekly sync notes.', resolutions);

    expect(result).toContain('## Memory Conflicts Resolved');
    expect(result).toContain('"engineer" → "tech lead" (Updated)');

    db.close();
    MemoryManager.resetInstance();
  });

  it('returns empty section when no conflicts for meetingId', async () => {
    const db = new Database(':memory:');
    runMigration(db);
    MemoryManager.resetInstance();
    const mm = MemoryManager.getInstance(db);

    const recap = new RecapLLM(null as any);
    const resolutions = mm.getConflictResolutions('mtg-no-conflicts');
    const result = recap.appendConflictDigest('Short notes.', resolutions);

    expect(result).toContain('## Memory Conflicts Resolved');
    expect(result).toContain('No memory conflicts detected.');

    db.close();
    MemoryManager.resetInstance();
  });
});
