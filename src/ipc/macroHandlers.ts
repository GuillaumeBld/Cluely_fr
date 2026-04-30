import Database from 'better-sqlite3';
import type { SafeHandleRegistrar } from './approvalHandlers';

export function registerMacroHandlers(
  registrar: SafeHandleRegistrar,
  db: Database.Database,
): void {
  registrar.safeHandle(
    'macro:confirm',
    async (_event: unknown, opts: unknown) => {
      const { proposal } = opts as {
        proposal: { projectId: string; meetingType: string; templateId: string; dispatchTarget: string };
      };
      db.prepare(
        `INSERT OR IGNORE INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target)
         VALUES (?, ?, ?, ?)`,
      ).run(proposal.projectId, proposal.meetingType, proposal.templateId, proposal.dispatchTarget);
      return { success: true };
    },
  );

  registrar.safeHandle(
    'macro:dismiss',
    async () => {
      // No-op for now — no "don't ask again" persistence in this tranche
      return { success: true };
    },
  );

  registrar.safeHandle(
    'macro:override',
    async (_event: unknown, opts: unknown) => {
      const { meetingId } = opts as { meetingId: string };
      // Override is handled in-memory by PostMeetingProcessor via an override set.
      // This handler serves as the IPC entry point — the actual flag is managed
      // by the caller who maintains the override state.
      return { meetingId, overridden: true };
    },
  );
}
