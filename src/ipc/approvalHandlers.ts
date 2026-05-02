import type { WorkflowDraft } from '../types/workflows';
import type { Dispatcher } from '../services/ArchonDispatcher';

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
      try {
        const { jobId } = await dispatcher.dispatch(draft);
        await decisionLedger.appendDispatch({ meetingId, jobId, draftId: draft.id });

        // Fire-and-forget: do not await, do not block approval result
        if (webhookEmitter) {
          webhookEmitter.emit(draft, jobId).catch((err) => {
            console.error('[approvalHandlers] Webhook emission failed:', err);
          });
        }

        return { jobId };
      } catch (err) {
        console.error('[approvalHandlers] approval:approve failed:', err);
        return { error: err instanceof Error ? err.message : 'Dispatch failed' };
      }
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
