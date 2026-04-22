import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { extractRelations, LLMFn, TripleProposal } from '../../electron/memory/RelationExtractor';

describe('extractRelations', () => {
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

  const stubLLM = (proposals: TripleProposal[]): LLMFn => {
    return async (_system: string, _user: string) => JSON.stringify(proposals);
  };

  it('creates nodes and edges from valid proposals', async () => {
    const llm = stubLLM([
      {
        sourceKind: 'person',
        sourceLabel: 'Alice',
        targetKind: 'person',
        targetLabel: 'Bob',
        predicate: 'knows',
        confidence: 0.9,
        context: 'Alice mentioned she knows Bob',
      },
    ]);

    const result = await extractRelations('Alice mentioned she knows Bob', 'meeting-1', llm, mm);
    expect(result.length).toBe(1);

    // Verify nodes were created
    const nodes = mm.findNodes('person');
    expect(nodes.length).toBe(2);

    // Verify edge was created (confidence 0.9 >= 0.7)
    const aliceNode = mm.findNodes('person', 'Alice')[0];
    const edges = mm.getEdgesFrom(aliceNode.id);
    expect(edges.length).toBe(1);
    expect(edges[0].predicate).toBe('knows');
  });

  it('routes low-confidence proposals to pending_review', async () => {
    const llm = stubLLM([
      {
        sourceKind: 'person',
        sourceLabel: 'Charlie',
        targetKind: 'topic',
        targetLabel: 'Budget',
        predicate: 'agreed_with',
        confidence: 0.5,
        context: 'Charlie might have agreed about the budget',
      },
    ]);

    await extractRelations('Charlie might have agreed about the budget', 'meeting-2', llm, mm);

    const charlie = mm.findNodes('person', 'Charlie')[0];
    const edges = mm.getEdgesFrom(charlie.id);
    expect(edges.length).toBe(0);

    const pending = mm.getPendingReview();
    expect(pending.length).toBe(1);
    expect(pending[0].predicate).toBe('agreed_with');
  });

  it('handles invalid LLM response gracefully', async () => {
    const badLLM: LLMFn = async () => 'not valid json {{{';
    const result = await extractRelations('some text', null, badLLM, mm);
    expect(result).toEqual([]);
  });

  it('skips proposals with missing required fields', async () => {
    const llm = stubLLM([
      {
        sourceKind: 'person',
        sourceLabel: '',  // empty
        targetKind: 'person',
        targetLabel: 'Bob',
        predicate: 'knows',
        confidence: 0.9,
        context: 'test',
      },
    ]);

    const result = await extractRelations('test', null, llm, mm);
    expect(result.length).toBe(0);
  });

  it('skips proposals with invalid confidence', async () => {
    const llm = stubLLM([
      {
        sourceKind: 'person',
        sourceLabel: 'Alice',
        targetKind: 'person',
        targetLabel: 'Bob',
        predicate: 'knows',
        confidence: 1.5,  // out of range
        context: 'test',
      },
    ]);

    const result = await extractRelations('test', null, llm, mm);
    expect(result.length).toBe(0);
  });
});
