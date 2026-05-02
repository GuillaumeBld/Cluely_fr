import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { PostMeetingProcessor, DecisionExtractor } from '../../electron/services/PostMeetingProcessor';
import { DecisionLedger } from '../../electron/services/DecisionLedger';
import { GoalAligner } from '../../electron/memory/GoalAligner';
import { LLMFn } from '../../electron/memory/RelationExtractor';

// Minimal stubs for DecisionLedger and GoalAligner
function makeLedgerStub() {
  return {
    append: vi.fn().mockReturnValue(true),
  } as unknown as DecisionLedger;
}

function makeAlignerStub() {
  return {
    align: vi.fn().mockResolvedValue(null),
  } as unknown as GoalAligner;
}

function makeExtractorStub(): DecisionExtractor {
  return {
    extractDecisions: vi.fn().mockResolvedValue([
      { text: 'Ship v2 by Friday', speaker: 'Alice', timestamp: '00:10' },
    ]),
  };
}

describe('PostMeetingProcessor (electron) — relation extraction', () => {
  let db: Database.Database;
  let mm: MemoryManager;

  beforeEach(() => {
    MemoryManager.resetInstance();
    PostMeetingProcessor.resetInstance();
    db = new Database(':memory:');
    mm = MemoryManager.getInstance(db);
  });

  afterEach(() => {
    db.close();
    MemoryManager.resetInstance();
    PostMeetingProcessor.resetInstance();
  });

  it('calls extractRelations after decision extraction when llmFn is provided', async () => {
    const llmFn: LLMFn = vi.fn().mockResolvedValue(JSON.stringify([
      {
        sourceKind: 'person',
        sourceLabel: 'Alice',
        targetKind: 'commitment',
        targetLabel: 'Ship v2',
        predicate: 'owes',
        confidence: 0.85,
        context: 'Alice will ship v2',
      },
    ]));

    const processor = PostMeetingProcessor.getInstance(
      makeLedgerStub(),
      makeAlignerStub(),
      makeExtractorStub(),
      llmFn,
      mm,
    );

    await processor.run('meeting-1', 'Alice said she will ship v2 by Friday');

    expect(llmFn).toHaveBeenCalledWith(
      expect.stringContaining('commitment'),
      'Alice said she will ship v2 by Friday',
    );

    // Verify node was created
    const people = mm.findNodes('person', 'Alice');
    expect(people).toHaveLength(1);

    // Verify edge was created (confidence 0.85 > 0.7 gate)
    const edges = mm.getEdgesFrom(people[0].id);
    expect(edges).toHaveLength(1);
    expect(edges[0].predicate).toBe('owes');
  });

  it('does not call extractRelations when llmFn is not provided', async () => {
    const processor = PostMeetingProcessor.getInstance(
      makeLedgerStub(),
      makeAlignerStub(),
      makeExtractorStub(),
    );

    const written = await processor.run('meeting-1', 'some transcript');

    expect(written).toBe(1);
    // No relation nodes should exist
    const nodes = mm.findNodes();
    expect(nodes).toHaveLength(0);
  });

  it('handles extractRelations failure gracefully', async () => {
    const llmFn: LLMFn = vi.fn().mockRejectedValue(new Error('LLM timeout'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const processor = PostMeetingProcessor.getInstance(
      makeLedgerStub(),
      makeAlignerStub(),
      makeExtractorStub(),
      llmFn,
      mm,
    );

    const written = await processor.run('meeting-1', 'some transcript');

    // Decisions should still be written even if relation extraction fails
    expect(written).toBe(1);
    errorSpy.mockRestore();
  });
});
