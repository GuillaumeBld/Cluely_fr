import { describe, it, expect, vi } from 'vitest';
import { ArchonDispatcher, HttpClient } from '../../src/services/ArchonDispatcher';
import type { WorkflowDraft } from '../../src/types/workflows';

function makeDraft(): WorkflowDraft {
  return {
    id: 'draft-1',
    templateId: 'code-task',
    confidence: 0.85,
    payload: {
      title: 'Write Tests',
      description: 'Write unit tests',
      steps: ['step 1'],
    },
    kbCitations: [{ id: 'kb-1', label: 'Citation 1', source: 'doc.md' }],
    goalTag: 'quality',
    rawExcerpt: 'I will write tests',
    speaker: 'Alice',
    timestamp: '00:15',
  };
}

describe('ArchonDispatcher', () => {
  it('dispatches a draft and returns jobId', async () => {
    const httpClient: HttpClient = {
      post: vi.fn().mockResolvedValue({ jobId: 'job-123' }),
    };
    const dispatcher = new ArchonDispatcher({ baseUrl: 'http://localhost:3000' }, httpClient);

    const result = await dispatcher.dispatch(makeDraft());

    expect(result.jobId).toBe('job-123');
    expect(httpClient.post).toHaveBeenCalledWith(
      'http://localhost:3000/api/jobs',
      expect.objectContaining({
        templateId: 'code-task',
        payload: expect.objectContaining({ title: 'Write Tests' }),
      }),
    );
  });

  it('propagates HTTP errors', async () => {
    const httpClient: HttpClient = {
      post: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    const dispatcher = new ArchonDispatcher({ baseUrl: 'http://localhost:3000' }, httpClient);

    await expect(dispatcher.dispatch(makeDraft())).rejects.toThrow('Network error');
  });
});
