import type { WorkflowDraft, Dispatcher } from '../types/workflows';

export interface DecisionLedger {
  appendDispatch(entry: { meetingId: string; jobId: string; draftId: string }): Promise<void>;
  appendDismissal(entry: { meetingId: string; draftId: string; reason: string }): Promise<void>;
}

export interface SafeHandleRegistrar {
  safeHandle(channel: string, listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface WebhookEmitter {
  emit(draft: WorkflowDraft, jobId: string): Promise<void>;
}

export function registerApprovalHandlers(
  registrar: SafeHandleRegistrar,
  dispatcher: Dispatcher,
  decisionLedger: DecisionLedger,
  webhookEmitter?: WebhookEmitter,
): void {
  registrar.safeHandle(
    'approval:approve',
    async (_event: unknown, opts: unknown) => {
      const { draft, meetingId } = opts as { draft: WorkflowDraft; meetingId: string };

      let jobId: string;
      try {
        ({ jobId } = await dispatcher.dispatch(draft));
      } catch (err) {
        console.error('[approvalHandlers] approval:approve — dispatch failed:', err);
        return { error: err instanceof Error ? err.message : 'Dispatch failed' };
      }

      // Fire-and-forget: do not await, do not block approval result
      if (webhookEmitter) {
        webhookEmitter.emit(draft, jobId).catch((err) => {
          console.error('[approvalHandlers] Webhook emission failed:', err);
        });
      }

      try {
        await decisionLedger.appendDispatch({ meetingId, jobId, draftId: draft.id });
      } catch (err) {
        // Job is already dispatched — log and continue in degraded mode
        console.error('[approvalHandlers] approval:approve — ledger write failed (job dispatched, jobId:', jobId, '):', err);
      }

      return { jobId };
    },
  );

  registrar.safeHandle(
    'approval:dismiss',
    async (_event: unknown, opts: unknown) => {
      const { draftId, meetingId, reason } = opts as {
        draftId: string;
        meetingId: string;
        reason: string;
      };
      try {
        await decisionLedger.appendDismissal({ meetingId, draftId, reason });
        return { success: true };
      } catch (err) {
        console.error('[approvalHandlers] approval:dismiss failed:', err);
        return { error: err instanceof Error ? err.message : 'Dismissal failed' };
      }
    },
  );
}
