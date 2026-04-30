import { describe, it, expect, vi, beforeEach } from 'vitest';
import { run, PostMeetingDeps } from '../../src/services/PostMeetingProcessor';
import { resetEmbeddings } from '../../src/services/WorkflowClassifier';

function makeDeps(): PostMeetingDeps {
  return {
    llmClient: {
      chat: vi.fn()
        // First call: extractActionItems
        .mockResolvedValueOnce(JSON.stringify([
          { text: 'Write unit tests', speaker: 'Alice', timestamp: '00:10', rawExcerpt: 'Alice: write unit tests' },
          { text: 'Send follow up email', speaker: 'Bob', timestamp: '00:20', rawExcerpt: 'Bob: send follow up email' },
        ]))
        // Subsequent calls: WorkflowDrafter.draft (one per action item)
        .mockResolvedValueOnce(JSON.stringify({
          title: 'Write Unit Tests',
          description: 'Implement tests',
          steps: ['Set up fixtures', 'Write tests'],
        }))
        .mockResolvedValueOnce(JSON.stringify({
          title: 'Send Follow Up Email',
          description: 'Email team',
          steps: ['Draft email', 'Send'],
        })),
    },
    embeddingClient: {
      embed: vi.fn().mockResolvedValue([1, 0, 0, 0, 0]),
    },
    kbService: {
      queryCitations: vi.fn().mockResolvedValue([
        { id: 'kb-1', label: 'Test Guide', source: 'guide.md' },
      ]),
    },
    goalAligner: {
      getGoalTag: vi.fn().mockResolvedValue('productivity'),
    },
    emitter: {
      send: vi.fn(),
    },
  };
}

describe('PostMeetingProcessor', () => {
  beforeEach(() => {
    resetEmbeddings();
  });

  it('processes transcript and emits drafts-ready with 2 drafts', async () => {
    const deps = makeDeps();
    const drafts = await run('fixture transcript with action items', 'meeting-1', deps);

    expect(drafts).toHaveLength(2);
    expect(deps.emitter.send).toHaveBeenCalledWith('approval:drafts-ready', {
      drafts: expect.arrayContaining([
        expect.objectContaining({ payload: expect.objectContaining({ title: 'Write Unit Tests' }) }),
        expect.objectContaining({ payload: expect.objectContaining({ title: 'Send Follow Up Email' }) }),
      ]),
    });
  });

  it('returns empty array and does not emit for empty transcript', async () => {
    const deps = makeDeps();
    const drafts = await run('', 'meeting-1', deps);

    expect(drafts).toEqual([]);
    expect(deps.emitter.send).not.toHaveBeenCalled();
  });

  it('completes within reasonable time', async () => {
    const deps = makeDeps();
    const start = Date.now();
    await run('fixture transcript', 'meeting-1', deps);
    const elapsed = Date.now() - start;

    // With mocked services, should complete in well under 1 second
    expect(elapsed).toBeLessThan(5000);
  });
});
