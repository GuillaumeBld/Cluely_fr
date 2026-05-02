import { BrowserWindow } from 'electron';
import { AgentStateManager } from './AgentStateManager';
import { PermissionsAuditLog } from './PermissionsAuditLog';
import { CommitmentStalenessChecker } from './CommitmentStalenessChecker';
import { IpcEventBus } from './IpcEventBus';
import type { CalendarEvent } from './CalendarManager';
import type { BackgroundTriggerDrafter, WorkflowDraft } from './BackgroundTriggerDrafter';
import type { BackgroundCostTracker } from './BackgroundCostTracker';
import type { EmailManager } from './EmailManager';

export interface CalendarSource {
  getUpcomingEvents(force?: boolean): Promise<CalendarEvent[]>;
}

const PRE_BRIEF_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class BackgroundAgent {
  private timer: NodeJS.Timeout | null = null;
  private _intervalMs: number;
  private _enabled: boolean = true;
  private _dailyBudgetCents: number = 10;
  private _lastEmailCheckAt: number = Date.now();
  private _pendingKBUpdate: { summary: string; timestamp: number } | null = null;
  private _kbHandler = (payload: { summary: string; timestamp: number }) => {
    this._pendingKBUpdate = payload;
  };

  constructor(
    private stateManager: AgentStateManager,
    private auditLog: PermissionsAuditLog,
    private stalenessChecker: CommitmentStalenessChecker,
    private calendarSource: CalendarSource,
    intervalMs = 30 * 60 * 1000,
    private drafter: BackgroundTriggerDrafter | null = null,
    private costTracker: BackgroundCostTracker | null = null,
    private emailManager: EmailManager | null = null,
  ) {
    this._intervalMs = intervalMs;
    this._subscribeToKBUpdates();
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

  setEnabled(enabled: boolean): void { this._enabled = enabled; }
  isEnabled(): boolean { return this._enabled; }
  setDailyBudgetCents(cents: number): void { this._dailyBudgetCents = cents; }

  private _subscribeToKBUpdates(): void {
    IpcEventBus.onTyped('kb:updated', this._kbHandler);
  }

  dispose(): void {
    this.stop();
    IpcEventBus.offTyped('kb:updated', this._kbHandler);
  }

  async _runCycle(): Promise<void> {
    if (this.stateManager.isPaused()) return;
    if (!this._enabled) return;

    // Cost gate: skip if daily budget exceeded
    if (this.costTracker?.isOverBudget(this._dailyBudgetCents)) {
      console.log('[BackgroundAgent] Daily cost budget reached, skipping cycle');
      return;
    }

    const drafts: WorkflowDraft[] = [];
    let events: Awaited<ReturnType<typeof this.calendarSource.getUpcomingEvents>> = [];
    const now = Date.now();

    // 1. Calendar scan — look for events starting within 5 minutes
    try {
      this.auditLog.append({ dataType: 'calendar', purpose: 'pre-meeting-scan' });
      events = await this.calendarSource.getUpcomingEvents(true);

      for (const event of events) {
        const startMs = new Date(event.startTime).getTime();
        const diff = startMs - now;

        if (diff >= 0 && diff <= PRE_BRIEF_WINDOW_MS) {
          // Existing broadcast (keep for backward compat)
          this.broadcast('agent:pre-brief-ready', {
            meetingId: event.id,
            title: event.title,
            startTime: event.startTime,
            attendees: event.attendees,
          });
          // Generate workflow draft for upcoming meeting prep
          if (this.drafter) {
            const d = await this.drafter.draftFromCalendarChange(event);
            if (d) drafts.push(d);
          }
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
        this.broadcast('agent:stale-commitments', stale); // keep existing
        if (this.drafter) {
          for (const c of stale) {
            const d = await this.drafter.draftFromStaleness(c);
            if (d) drafts.push(d);
          }
        }
      }

      // 3. Email scan — detect emails newer than last check
      if (this.emailManager && this.drafter) {
        this.auditLog.append({ dataType: 'email', purpose: 'new-email-scan' });
        const attendeeEmails = events.flatMap(e => e.attendees ?? []);
        if (attendeeEmails.length > 0) {
          const emailsByAttendee = await this.emailManager.getMessagesFromSenders(attendeeEmails);
          for (const [, msgs] of emailsByAttendee) {
            for (const msg of msgs) {
              if (new Date(msg.date).getTime() > this._lastEmailCheckAt) {
                const d = await this.drafter.draftFromEmail(msg);
                if (d) drafts.push(d);
              }
            }
          }
        }
        this._lastEmailCheckAt = now;
      }

      // 4. KB update trigger
      if (this._pendingKBUpdate && this.drafter) {
        this.auditLog.append({ dataType: 'kb', purpose: 'kb-update-review' });
        const d = await this.drafter.draftFromKBUpdate(this._pendingKBUpdate);
        if (d) drafts.push(d);
        this._pendingKBUpdate = null;
      }

      // 5. Broadcast all generated drafts to Pending Workflows tray
      if (drafts.length > 0) {
        this.broadcast('approval:drafts-ready', { drafts });
        // Record cost
        if (this.costTracker) {
          for (const d of drafts) {
            this.costTracker.recordUsage(d.tokensUsed, d.tokensUsed * 0.000003);
          }
        }
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
