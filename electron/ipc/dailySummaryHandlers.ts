import { ipcMain } from 'electron';
import type { DatabaseManager } from '../db/DatabaseManager';
import type { DailySummaryScheduler } from '../services/DailySummaryScheduler';

export function registerDailySummaryHandlers(
  db: DatabaseManager,
  scheduler: DailySummaryScheduler,
): void {
  const safeHandle = (channel: string, listener: (event: any, ...args: any[]) => any) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, listener);
  };

  safeHandle('daily-summary:get', (_event, date?: string) => {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    const row = db.getDailySummary(targetDate);
    if (!row) return null;
    try {
      return JSON.parse(row.summaryJson);
    } catch {
      return null;
    }
  });

  safeHandle('daily-summary:generate', async () => {
    return scheduler.generateNow();
  });
}
