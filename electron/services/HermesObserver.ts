import { BrowserWindow } from 'electron';
import { AgentStateManager } from './AgentStateManager';
import type { HermesDrafter, HermesPattern } from './HermesDrafter';
import type { WorkflowDraft } from './BackgroundTriggerDrafter';
import { MemoryManager } from '../memory/MemoryManager';

export class HermesObserver {
  private timer: NodeJS.Timeout | null = null;
  private _intervalMs: number;
  private _enabled: boolean = true;
  private _sensitivity: number = 0.5;

  constructor(
    private stateManager: AgentStateManager,
    intervalMs = 6 * 60 * 60 * 1000,
    private drafter: HermesDrafter | null = null,
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

  setEnabled(enabled: boolean): void { this._enabled = enabled; }
  isEnabled(): boolean { return this._enabled; }
  setSensitivity(s: number): void { this._sensitivity = Math.max(0, Math.min(1, s)); }
  getSensitivity(): number { return this._sensitivity; }

  async _runCycle(): Promise<void> {
    if (!this._enabled) return;
    if (this.stateManager.isPaused()) return;
    try {
      const patterns = this._detectPatterns();
      const drafts: WorkflowDraft[] = [];
      for (const pattern of patterns) {
        if (pattern.score < this._sensitivity) continue;
        if (!this.drafter) continue;
        let draft: WorkflowDraft | null = null;
        if (pattern.kind === 'recurring-blocker') draft = await this.drafter.draftFromRecurringBlocker(pattern);
        else if (pattern.kind === 'goal-drift') draft = await this.drafter.draftFromGoalDrift(pattern);
        else if (pattern.kind === 'contradiction') draft = await this.drafter.draftFromContradiction(pattern);
        if (draft) drafts.push(draft);
      }
      if (drafts.length > 0) {
        this._broadcast('approval:drafts-ready', { drafts });
        console.log(`[HermesObserver] cycle complete, ${drafts.length} pattern insight(s) drafted`);
      }
    } catch (err) {
      console.warn('[HermesObserver] cycle failed, will retry next interval:', err);
    }
  }

  _detectPatterns(): HermesPattern[] {
    try {
      const db = MemoryManager.getInstance().getDb();
      if (!db) return [];
      const patterns: HermesPattern[] = [];

      // Pattern 1 — Recurring Blockers
      try {
        const rows = db.prepare(`
          SELECT n.label, COUNT(DISTINCT e.meeting_id) AS session_count
          FROM memory_edges e
          JOIN memory_nodes n ON n.id = e.target_id
          WHERE e.predicate = 'blocked_by'
          GROUP BY e.target_id
          HAVING session_count >= 2
        `).all() as Array<{ label: string; session_count: number }>;

        for (const row of rows) {
          patterns.push({
            kind: 'recurring-blocker',
            label: row.label,
            score: Math.min(1, row.session_count / 5),
            occurrences: row.session_count,
          });
        }
      } catch { /* table may not exist yet */ }

      // Pattern 2 — Goal Drift
      try {
        const cutoff = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000);
        const goals = db.prepare(`
          SELECT g.title, (unixepoch() - g.created_at) / 86400 AS age_days
          FROM goals g
          WHERE g.completed_at IS NULL
            AND g.created_at < ?
            AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.goal_id = g.id)
        `).all(cutoff) as Array<{ title: string; age_days: number }>;

        for (const g of goals) {
          patterns.push({
            kind: 'goal-drift',
            label: g.title,
            score: Math.min(1, g.age_days / 60),
            ageDays: g.age_days,
          });
        }
      } catch { /* table may not exist yet */ }

      // Pattern 3 — Unresolved Contradictions
      try {
        const conflicts = db.prepare(`
          SELECT entity, old_value, new_value
          FROM pending_conflicts
          WHERE resolved_at IS NULL
          ORDER BY created_at DESC
          LIMIT 10
        `).all() as Array<{ entity: string; old_value: string; new_value: string }>;

        for (const c of conflicts) {
          patterns.push({
            kind: 'contradiction',
            label: c.entity,
            score: 0.6,
            oldValue: c.old_value,
            newValue: c.new_value,
          });
        }
      } catch { /* table may not exist yet */ }

      return patterns;
    } catch {
      // MemoryManager not initialized yet
      return [];
    }
  }

  private _broadcast(channel: string, data: unknown): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }

  dispose(): void {
    this.stop();
  }
}
