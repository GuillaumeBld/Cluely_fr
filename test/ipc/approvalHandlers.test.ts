import { describe, it, expect, vi } from 'vitest';
import { registerApprovalHandlers, DecisionLedger, SafeHandleRegistrar, WebhookEmitter } from '../../src/ipc/approvalHandlers';
import type { Dispatcher } from '../../src/types/workflows';
import type { WorkflowDraft } from '../../src/types/workflows';

type IpcListener = (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown;

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
    const handlers = new Map<string, IpcListener>();
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
    const handlers = new Map<string, IpcListener>();
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
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const handlers = new Map<string, IpcListener>();
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
    // flush microtasks so the fire-and-forget .catch runs
    await Promise.resolve();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[approvalHandlers] Webhook emission failed:'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('approval:approve works without webhookEmitter (optional param)', async () => {
    const handlers = new Map<string, IpcListener>();
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

  it('approval:approve returns error object when dispatcher.dispatch rejects', async () => {
    const handlers = new Map<string, IpcListener>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };
    const dispatcher: Dispatcher = {
      dispatch: vi.fn().mockRejectedValue(new Error('remote timeout')),
    };
    const ledger: DecisionLedger = {
      appendDispatch: vi.fn(),
      appendDismissal: vi.fn(),
    };

    registerApprovalHandlers(registrar, dispatcher, ledger);

    const approveHandler = handlers.get('approval:approve')!;
    const result = await approveHandler(null, { draft: makeDraft(), meetingId: 'meeting-1' });

    expect(result).toEqual({ error: 'remote timeout' });
    expect(ledger.appendDispatch).not.toHaveBeenCalled();
  });

  it('approval:approve returns fallback string when dispatcher throws non-Error', async () => {
    const handlers = new Map<string, IpcListener>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };
    const dispatcher: Dispatcher = {
      dispatch: vi.fn().mockRejectedValue('string-error'),
    };
    const ledger: DecisionLedger = {
      appendDispatch: vi.fn(),
      appendDismissal: vi.fn(),
    };

    registerApprovalHandlers(registrar, dispatcher, ledger);

    const approveHandler = handlers.get('approval:approve')!;
    const result = await approveHandler(null, { draft: makeDraft(), meetingId: 'meeting-1' });

    expect(result).toEqual({ error: 'Dispatch failed' });
  });

  it('approval:approve returns jobId even when ledger write fails (degraded mode)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const handlers = new Map<string, IpcListener>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };
    const dispatcher: Dispatcher = {
      dispatch: vi.fn().mockResolvedValue({ jobId: 'job-ledger-fail' }),
    };
    const ledger: DecisionLedger = {
      appendDispatch: vi.fn().mockRejectedValue(new Error('db locked')),
      appendDismissal: vi.fn(),
    };

    registerApprovalHandlers(registrar, dispatcher, ledger);

    const approveHandler = handlers.get('approval:approve')!;
    const result = await approveHandler(null, { draft: makeDraft(), meetingId: 'meeting-1' });

    // Job dispatched — caller gets jobId despite ledger failure
    expect(result).toEqual({ jobId: 'job-ledger-fail' });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[approvalHandlers] approval:approve — ledger write failed'),
      expect.stringContaining('job-ledger-fail'),
      expect.anything(),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('approval:dismiss handler writes dismissal to ledger', async () => {
    const handlers = new Map<string, IpcListener>();
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

  it('approval:dismiss returns error object when ledger.appendDismissal rejects', async () => {
    const handlers = new Map<string, IpcListener>();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };
    const dispatcher: Dispatcher = { dispatch: vi.fn() };
    const ledger: DecisionLedger = {
      appendDispatch: vi.fn(),
      appendDismissal: vi.fn().mockRejectedValue(new Error('db write failed')),
    };

    registerApprovalHandlers(registrar, dispatcher, ledger);

    const dismissHandler = handlers.get('approval:dismiss')!;
    const result = await dismissHandler(null, {
      draftId: 'draft-1',
      meetingId: 'meeting-1',
      reason: 'not relevant',
    });

    expect(result).toEqual({ error: 'db write failed' });
  });
});
