import type { MeetingCostTracker } from '../services/MeetingCostTracker';
import type { CredentialsManager } from '../services/CredentialsManager';

type SafeHandleRegistrar = {
  safeHandle(channel: string, listener: (event: any, ...args: any[]) => Promise<any> | any): void;
};

export function registerCostHandlers(
  registrar: SafeHandleRegistrar,
  costTracker: MeetingCostTracker | null,
  credsMgr: CredentialsManager,
): void {
  registrar.safeHandle('cost:get-session-spend', async (_event: any, meetingId: string) => {
    if (!costTracker) return { totalCents: 0, byModel: [] };
    try {
      return costTracker.getMeetingSpend(meetingId);
    } catch (err: any) {
      console.error('[costHandlers] get-session-spend failed:', err);
      return { error: err.message };
    }
  });

  registrar.safeHandle('cost:get-daily-spend', async (_event: any, date?: string) => {
    if (!costTracker) return { totalCents: 0, byModel: [] };
    try {
      return costTracker.getDailySpend(date);
    } catch (err: any) {
      console.error('[costHandlers] get-daily-spend failed:', err);
      return { error: err.message };
    }
  });

  registrar.safeHandle('cost:set-daily-budget', async (_event: any, cents: number) => {
    try {
      credsMgr.setGlobalDailyBudgetCents(cents);
      return { success: true };
    } catch (err: any) {
      console.error('[costHandlers] set-daily-budget failed:', err);
      return { error: err.message };
    }
  });

  registrar.safeHandle('cost:get-daily-budget', async () => {
    try {
      return credsMgr.getGlobalDailyBudgetCents();
    } catch (err: any) {
      console.error('[costHandlers] get-daily-budget failed:', err);
      return { error: err.message };
    }
  });
}
