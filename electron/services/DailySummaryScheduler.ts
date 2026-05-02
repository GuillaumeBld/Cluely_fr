import type { DatabaseManager } from '../db/DatabaseManager';
import type { DailySummaryLLM, DailySummaryResult } from '../llm/DailySummaryLLM';
import type { BrowserWindow } from 'electron';

const DEFAULT_TRIGGER_HOUR = 17;
const DEFAULT_TRIGGER_MINUTE = 0;

export class DailySummaryScheduler {
  private timer: NodeJS.Timeout | null = null;
  private _enabled: boolean = true;
  private _triggerHour: number = DEFAULT_TRIGGER_HOUR;
  private _triggerMinute: number = DEFAULT_TRIGGER_MINUTE;
  private _lastGeneratedDate: string = '';
  private _window: BrowserWindow | null = null;

  constructor(
    private db: DatabaseManager,
    private llm: DailySummaryLLM,
  ) {}

  setWindow(win: BrowserWindow | null): void {
    this._window = win;
  }

  setSchedule(hour: number, minute: number): void {
    this._triggerHour = hour;
    this._triggerMinute = minute;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => this._checkAndGenerate().catch(() => {}), 60_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async generateNow(): Promise<DailySummaryResult | null> {
    const todayStr = new Date().toISOString().slice(0, 10);
    return this._doGenerate(todayStr);
  }

  private async _checkAndGenerate(): Promise<void> {
    if (!this._enabled) return;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (
      now.getHours() !== this._triggerHour ||
      now.getMinutes() !== this._triggerMinute
    ) return;

    if (this._lastGeneratedDate === todayStr) return;

    try {
      await this._doGenerate(todayStr);
    } catch (err) {
      console.warn('[DailySummaryScheduler] generation failed, will retry next trigger:', err);
    }
  }

  private async _doGenerate(dateStr: string): Promise<DailySummaryResult | null> {
    const meetings = this.db.getMeetingsByDate(dateStr);
    if (meetings.length === 0) return null;

    const input = {
      date: dateStr,
      meetings: meetings.map(m => ({
        title: m.title,
        overview: m.detailedSummary?.overview,
        actionItems: (m.detailedSummary?.actionItems ?? []).map(ai =>
          typeof ai === 'string' ? { text: ai } : { text: ai.text, speaker: ai.speaker }
        ),
        keyPoints: m.detailedSummary?.keyPoints ?? [],
      })),
    };

    const result = await this.llm.generate(input);
    this.db.saveDailySummary(dateStr, meetings.length, JSON.stringify(result));
    this._lastGeneratedDate = dateStr;

    if (this._window && !this._window.isDestroyed()) {
      this._window.webContents.send('daily-summary:ready', result);
    }

    return result;
  }
}
