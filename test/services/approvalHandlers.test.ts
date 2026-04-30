import { describe, it, expect, vi } from 'vitest';
import { registerApprovalHandlers, DecisionLedger, SafeHandleRegistrar } from '../../src/ipc/approvalHandlers';
import { ArchonDispatcher } from '../../src/services/ArchonDispatcher';
import type { WorkflowDraft } from '../../src/types/workflows';

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

describe('approvalHandlers', () => {
  it('approval:approve handler dispatches and writes ledger entry', async () => {
    const handlers = new Map<string, Function>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };

    const httpClient = { post: vi.fn().mockResolvedValue({ jobId: 'job-456' }) };
    const dispatcher = new ArchonDispatcher({ baseUrl: 'http://localhost:3000' }, httpClient);

    const ledger: DecisionLedger = {
      appendDispatch: vi.fn().mockResolvedValue(undefined),
      appendDismissal: vi.fn().mockResolvedValue(undefined),
    };

    registerApprovalHandlers(registrar, dispatcher, ledger);

    const approveHandler = handlers.get('approval:approve')!;
    const result = await approveHandler(null, { draft: makeDraft(), meetingId: 'meeting-1' });

    expect(result).toEqual({ jobId: 'job-456' });
    expect(ledger.appendDispatch).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      jobId: 'job-456',
      draftId: 'draft-1',
    });
  });

  it('approval:dismiss handler writes dismissal to ledger', async () => {
    const handlers = new Map<string, Function>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };

    const httpClient = { post: vi.fn() };
    const dispatcher = new ArchonDispatcher({ baseUrl: 'http://localhost:3000' }, httpClient);

    const ledger: DecisionLedger = {
      appendDispatch: vi.fn(),
      appendDismissal: vi.fn().mockResolvedValue(undefined),
    };

    registerApprovalHandlers(registrar, dispatcher, ledger);

    const dismissHandler = handlers.get('approval:dismiss')!;
    await dismissHandler(null, { draftId: 'draft-1', meetingId: 'meeting-1', reason: 'not relevant' });

    expect(ledger.appendDismissal).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      draftId: 'draft-1',
      reason: 'not relevant',
    });
  });
});
