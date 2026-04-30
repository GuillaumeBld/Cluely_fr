import { describe, it, expect, vi } from 'vitest';
import { draft, KBService, GoalAligner } from '../../src/services/WorkflowDrafter';
import type { LLMClient } from '../../src/services/RecapLLM';
import type { ActionItem } from '../../src/types/workflows';

function makeItem(): ActionItem {
  return {
    text: 'Write unit tests for the auth service',
    speaker: 'Alice',
    timestamp: '00:15',
    rawExcerpt: "Alice: I'll write unit tests for the auth service",
  };
}

function makeDeps(kbCitationCount: number) {
  const citations = Array.from({ length: kbCitationCount }, (_, i) => ({
    id: `kb-${i}`,
    label: `Citation ${i + 1}`,
    source: `source-${i}.md`,
  }));

  const llmClient: LLMClient = {
    chat: vi.fn().mockResolvedValue(
      JSON.stringify({
        title: 'Write Auth Service Tests',
        description: 'Implement comprehensive unit tests for the auth service',
        steps: ['Set up test fixtures', 'Write happy path tests', 'Write edge case tests'],
      }),
    ),
  };

  const kbService: KBService = {
    queryCitations: vi.fn().mockResolvedValue(citations),
  };

  const goalAligner: GoalAligner = {
    getGoalTag: vi.fn().mockResolvedValue('code-quality'),
  };

  return { llmClient, kbService, goalAligner };
}

describe('WorkflowDrafter', () => {
  it('creates a draft with KB citations and goal tag', async () => {
    const deps = makeDeps(2);
    const result = await draft(makeItem(), 'code-task', deps);

    expect(result.templateId).toBe('code-task');
    expect(result.kbCitations).toHaveLength(2);
    expect(result.goalTag).toBe('code-quality');
    expect(result.payload.title).toBe('Write Auth Service Tests');
    expect(result.payload.steps).toHaveLength(3);
    expect(result.speaker).toBe('Alice');
    expect(result.id).toMatch(/^draft-/);
  });

  it('returns empty kbCitations array when KB returns none', async () => {
    const deps = makeDeps(0);
    const result = await draft(makeItem(), 'code-task', deps);

    expect(result.kbCitations).toEqual([]);
    expect(Array.isArray(result.kbCitations)).toBe(true);
  });

  it('returns draft with fallback fields when LLM returns invalid JSON', async () => {
    const deps = makeDeps(1);
    (deps.llmClient.chat as ReturnType<typeof vi.fn>).mockResolvedValue('This is not JSON');
    const result = await draft(makeItem(), 'code-task', deps);

    expect(result.payload.title).toBe('Write unit tests for the auth service');
    expect(result.payload.description).toBe('');
    expect(result.payload.steps).toEqual([]);
  });

  it('calls KB with the action item text', async () => {
    const deps = makeDeps(1);
    await draft(makeItem(), 'code-task', deps);

    expect(deps.kbService.queryCitations).toHaveBeenCalledWith(
      'Write unit tests for the auth service',
      3,
    );
  });
});
