import type { WorkflowDraft } from '../types/workflows';
import type { ArchonDispatcher } from '../services/ArchonDispatcher';

export interface DecisionLedger {
  appendDispatch(entry: { meetingId: string; jobId: string; draftId: string }): Promise<void>;
  appendDismissal(entry: { meetingId: string; draftId: string; reason: string }): Promise<void>;
}

export interface SafeHandleRegistrar {
  safeHandle(channel: string, listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export function registerApprovalHandlers(
  registrar: SafeHandleRegistrar,
  archonDispatcher: ArchonDispatcher,
  decisionLedger: DecisionLedger,
): void {
  registrar.safeHandle(
    'approval:approve',
    async (_event: unknown, opts: unknown) => {
      const { draft, meetingId } = opts as { draft: WorkflowDraft; meetingId: string };
      const { jobId } = await archonDispatcher.dispatch(draft);
      await decisionLedger.appendDispatch({ meetingId, jobId, draftId: draft.id });
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
      await decisionLedger.appendDismissal({ meetingId, draftId, reason });
      return { success: true };
    },
  );
}
