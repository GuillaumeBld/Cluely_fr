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
      try {
        db.prepare(
          `INSERT OR IGNORE INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target)
           VALUES (?, ?, ?, ?)`,
        ).run(proposal.projectId, proposal.meetingType, proposal.templateId, proposal.dispatchTarget);
        return { success: true };
      } catch (err: any) {
        console.error('[macroHandlers] macro:confirm failed:', err);
        return { success: false, error: err?.message ?? String(err) };
      }
    },
  );

  registrar.safeHandle(
    'macro:dismiss',
    async () => {
      return { success: true };
    },
  );

  registrar.safeHandle(
    'macro:override',
    async (_event: unknown, opts: unknown) => {
      const { meetingId } = opts as { meetingId: string };
      return { meetingId, overridden: true };
    },
  );
}
