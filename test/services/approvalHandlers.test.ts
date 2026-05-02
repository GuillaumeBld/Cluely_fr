import { describe, it, expect, vi } from 'vitest';
import { registerApprovalHandlers, DecisionLedger, SafeHandleRegistrar, WebhookEmitter } from '../../src/ipc/approvalHandlers';
import type { Dispatcher } from '../../src/services/ArchonDispatcher';
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

    const dispatcher: Dispatcher = {
      dispatch: vi.fn().mockResolvedValue({ jobId: 'job-456' }),
    };

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

  it('approval:approve fires webhookEmitter after successful dispatch', async () => {
    const handlers = new Map<string, Function>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };

    const dispatcher: Dispatcher = {
      dispatch: vi.fn().mockResolvedValue({ jobId: 'job-789' }),
    };

    const ledger: DecisionLedger = {
      appendDispatch: vi.fn().mockResolvedValue(undefined),
      appendDismissal: vi.fn(),
    };

    const webhookEmitter: WebhookEmitter = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    registerApprovalHandlers(registrar, dispatcher, ledger, webhookEmitter);

    const approveHandler = handlers.get('approval:approve')!;
    const draft = makeDraft();
    const result = await approveHandler(null, { draft, meetingId: 'meeting-1' });

    expect(result).toEqual({ jobId: 'job-789' });
    expect(webhookEmitter.emit).toHaveBeenCalledWith(draft, 'job-789');
  });

  it('approval:approve succeeds even if webhookEmitter.emit rejects', async () => {
    const handlers = new Map<string, Function>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };

    const dispatcher: Dispatcher = {
      dispatch: vi.fn().mockResolvedValue({ jobId: 'job-fail' }),
    };

    const ledger: DecisionLedger = {
      appendDispatch: vi.fn().mockResolvedValue(undefined),
      appendDismissal: vi.fn(),
    };

    const webhookEmitter: WebhookEmitter = {
      emit: vi.fn().mockRejectedValue(new Error('network error')),
    };

    registerApprovalHandlers(registrar, dispatcher, ledger, webhookEmitter);

    const approveHandler = handlers.get('approval:approve')!;
    const result = await approveHandler(null, { draft: makeDraft(), meetingId: 'meeting-1' });

    // Approval still succeeds despite webhook failure
    expect(result).toEqual({ jobId: 'job-fail' });
  });

  it('approval:approve works without webhookEmitter (optional param)', async () => {
    const handlers = new Map<string, Function>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };

    const dispatcher: Dispatcher = {
      dispatch: vi.fn().mockResolvedValue({ jobId: 'job-no-hook' }),
    };

    const ledger: DecisionLedger = {
      appendDispatch: vi.fn().mockResolvedValue(undefined),
      appendDismissal: vi.fn(),
    };

    // No webhookEmitter passed
    registerApprovalHandlers(registrar, dispatcher, ledger);

    const approveHandler = handlers.get('approval:approve')!;
    const result = await approveHandler(null, { draft: makeDraft(), meetingId: 'meeting-1' });

    expect(result).toEqual({ jobId: 'job-no-hook' });
  });

  it('approval:dismiss handler writes dismissal to ledger', async () => {
    const handlers = new Map<string, Function>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };

    const dispatcher: Dispatcher = {
      dispatch: vi.fn(),
    };

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
