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
      meetingId: 'meeting-1',
    });
  });

  it('returns empty array and does not emit for empty transcript', async () => {
    const deps = makeDeps();
    const drafts = await run('', 'meeting-1', deps);

    expect(drafts).toEqual([]);
    expect(deps.emitter.send).not.toHaveBeenCalled();
  });

  it('skips failed items and continues processing remaining', async () => {
    const deps = makeDeps();
    // Override: first extract call returns 2 items, then draft calls:
    // first draft throws, second succeeds
    (deps.llmClient.chat as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce(JSON.stringify([
        { text: 'Task A', speaker: 'Alice', timestamp: '00:10', rawExcerpt: 'Alice: task A' },
        { text: 'Task B', speaker: 'Bob', timestamp: '00:20', rawExcerpt: 'Bob: task B' },
      ]))
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce(JSON.stringify({
        title: 'Task B Draft',
        description: 'Do task B',
        steps: ['Step 1'],
      }));

    const drafts = await run('transcript', 'meeting-1', deps);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].payload.title).toBe('Task B Draft');
    expect(deps.emitter.send).toHaveBeenCalled();
  });

  it('completes within reasonable time', async () => {
    const deps = makeDeps();
    const start = Date.now();
    await run('fixture transcript', 'meeting-1', deps);
    const elapsed = Date.now() - start;

    // With mocked services, should complete in well under 1 second
    expect(elapsed).toBeLessThan(5000);
  });

  describe('macro path', () => {
    function makeMacroDeps() {
      const deps = makeDeps();
      return {
        ...deps,
        meetingProjectId: 'proj-1',
        meetingType: 'standup',
        macroStore: {
          getActiveMacro: vi.fn().mockReturnValue({
            id: 1,
            project_id: 'proj-1',
            meeting_type: 'standup',
            template_id: 'forced-template',
            dispatch_target: 'slack',
            prior_context_count: 3,
            active: 1,
          }),
        },
        macroRunner: {
          run: vi.fn().mockReturnValue({
            templateId: 'forced-template',
            priorDecisions: [],
            dispatchTarget: 'slack',
            injectedMeetingIds: [],
          }),
        },
      };
    }

    it('uses macro templateId when macro is active', async () => {
      const deps = makeMacroDeps();
      const drafts = await run('fixture transcript with action items', 'meeting-1', deps);

      expect(deps.macroRunner!.run).toHaveBeenCalled();
      expect(drafts).toHaveLength(2);
      // All drafts should use the forced template
      for (const d of drafts) {
        expect(d.templateId).toBe('forced-template');
      }
    });

    it('skips macro when meeting is overridden', async () => {
      const deps = {
        ...makeMacroDeps(),
        overriddenMeetings: new Set(['meeting-1']),
      };

      const drafts = await run('fixture transcript with action items', 'meeting-1', deps);

      expect(deps.macroRunner!.run).not.toHaveBeenCalled();
      expect(drafts).toHaveLength(2);
    });

    it('emits macro:proposal when learner evaluates positively', async () => {
      const proposal = { projectId: 'proj-1', meetingType: 'standup', templateId: 'code-task', dispatchTarget: 'slack' };
      const deps = {
        ...makeDeps(),
        macroLearner: { evaluate: vi.fn().mockReturnValue(proposal) },
      };

      await run('fixture transcript with action items', 'meeting-1', deps);

      expect(deps.macroLearner.evaluate).toHaveBeenCalledWith('meeting-1');
      expect(deps.emitter.send).toHaveBeenCalledWith('macro:proposal', { proposal });
    });

    it('does not emit macro:proposal when learner returns null', async () => {
      const deps = {
        ...makeDeps(),
        macroLearner: { evaluate: vi.fn().mockReturnValue(null) },
      };

      await run('fixture transcript with action items', 'meeting-1', deps);

      expect(deps.macroLearner.evaluate).toHaveBeenCalledWith('meeting-1');
      const proposalCalls = (deps.emitter.send as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === 'macro:proposal',
      );
      expect(proposalCalls).toHaveLength(0);
    });
  });
});
