import { BrowserWindow } from 'electron';
import { AgentStateManager } from './AgentStateManager';
import { PermissionsAuditLog } from './PermissionsAuditLog';
import { CommitmentStalenessChecker } from './CommitmentStalenessChecker';
import type { CalendarEvent } from './CalendarManager';

export interface CalendarSource {
  getUpcomingEvents(force?: boolean): Promise<CalendarEvent[]>;
}

const PRE_BRIEF_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class BackgroundAgent {
  private timer: NodeJS.Timeout | null = null;
  private _intervalMs: number;

  constructor(
    private stateManager: AgentStateManager,
    private auditLog: PermissionsAuditLog,
    private stalenessChecker: CommitmentStalenessChecker,
    private calendarSource: CalendarSource,
    intervalMs = 30 * 60 * 1000,
  ) {
    this._intervalMs = intervalMs;
  }

  start(intervalMs?: number): void {
    if (intervalMs !== undefined) this._intervalMs = intervalMs;
    this.stop();
    this._runCycle().catch(() => {});
    this.timer = setInterval(() => this._runCycle(), this._intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setInterval(ms: number): void {
    this._intervalMs = ms;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  getIntervalMs(): number {
    return this._intervalMs;
  }

  async _runCycle(): Promise<void> {
    if (this.stateManager.isPaused()) return;

    // 1. Calendar scan — look for events starting within 5 minutes
    try {
      this.auditLog.append({ dataType: 'calendar', purpose: 'pre-meeting-scan' });
      const events = await this.calendarSource.getUpcomingEvents(true);
      const now = Date.now();

      for (const event of events) {
        const startMs = new Date(event.startTime).getTime();
        const diff = startMs - now;
        if (diff >= 0 && diff <= PRE_BRIEF_WINDOW_MS) {
          this.broadcast('agent:pre-brief-ready', {
            meetingId: event.id,
            title: event.title,
            startTime: event.startTime,
            attendees: event.attendees,
          });
        }
      }
    } catch (err) {
      console.warn('[BackgroundAgent] calendar scan failed, will retry next interval:', err);
    }

    // 2. Staleness check
    try {
      this.auditLog.append({ dataType: 'ledger', purpose: 'staleness-check' });
      const stale = this.stalenessChecker.check();
      if (stale.length > 0) {
        this.broadcast('agent:stale-commitments', stale);
      }
    } catch (err) {
      console.warn('[BackgroundAgent] staleness check failed, will retry next interval:', err);
    }
  }

  private broadcast(channel: string, data: unknown): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }
}
