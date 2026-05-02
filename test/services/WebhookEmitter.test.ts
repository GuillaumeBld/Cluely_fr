import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowDraft } from '../../src/types/workflows';

// Mock axios before importing
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Mock CredentialsManager
vi.mock('../../electron/services/CredentialsManager', () => ({
  CredentialsManager: {
    getInstance: vi.fn(),
  },
}));

import axios from 'axios';
import { CredentialsManager } from '../../electron/services/CredentialsManager';
import { CredentialsWebhookEmitter } from '../../electron/services/WebhookEmitter';

const mockedAxios = vi.mocked(axios);
const mockedCM = vi.mocked(CredentialsManager);

function makeDraft(): WorkflowDraft {
  return {
    id: 'draft-1',
    templateId: 'code-task',
    confidence: 0.85,
    payload: { title: 'Test', description: '', steps: [] },
    kbCitations: [],
    goalTag: 'quality',
    rawExcerpt: 'test',
    speaker: 'Alice',
    timestamp: '00:15',
  };
}

describe('CredentialsWebhookEmitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to all configured webhooks', async () => {
    const webhooks = [
      { id: 'w1', url: 'https://hooks.example.com/a', name: 'Hook A', createdAt: '2026-01-01' },
      { id: 'w2', url: 'https://hooks.example.com/b', name: 'Hook B', createdAt: '2026-01-02' },
    ];
    mockedCM.getInstance.mockReturnValue({ getExportWebhooks: () => webhooks } as any);
    mockedAxios.post.mockResolvedValue({ status: 200 });

    const emitter = new CredentialsWebhookEmitter();
    await emitter.emit(makeDraft(), 'job-123');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://hooks.example.com/a',
      expect.objectContaining({ jobId: 'job-123', draft: expect.objectContaining({ id: 'draft-1' }) }),
      { timeout: 5000 },
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://hooks.example.com/b',
      expect.objectContaining({ jobId: 'job-123' }),
      { timeout: 5000 },
    );
  });

  it('includes approvedAt in payload', async () => {
    const webhooks = [
      { id: 'w1', url: 'https://hooks.example.com/a', name: 'Hook A', createdAt: '2026-01-01' },
    ];
    mockedCM.getInstance.mockReturnValue({ getExportWebhooks: () => webhooks } as any);
    mockedAxios.post.mockResolvedValue({ status: 200 });

    const emitter = new CredentialsWebhookEmitter();
    await emitter.emit(makeDraft(), 'job-456');

    const payload = mockedAxios.post.mock.calls[0][1] as any;
    expect(payload.approvedAt).toBeDefined();
    expect(typeof payload.approvedAt).toBe('string');
  });

  it('one failing webhook does not block others', async () => {
    const webhooks = [
      { id: 'w1', url: 'https://hooks.example.com/fail', name: 'Fail Hook', createdAt: '2026-01-01' },
      { id: 'w2', url: 'https://hooks.example.com/ok', name: 'OK Hook', createdAt: '2026-01-02' },
    ];
    mockedCM.getInstance.mockReturnValue({ getExportWebhooks: () => webhooks } as any);
    mockedAxios.post
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ status: 200 });

    const emitter = new CredentialsWebhookEmitter();
    // Should not throw
    await emitter.emit(makeDraft(), 'job-789');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('no-ops when no webhooks configured', async () => {
    mockedCM.getInstance.mockReturnValue({ getExportWebhooks: () => [] } as any);

    const emitter = new CredentialsWebhookEmitter();
    await emitter.emit(makeDraft(), 'job-empty');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
