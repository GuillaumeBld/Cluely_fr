> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Implement the Cross-Session Background Agent as a configurable polling loop in the Electron main process. It pauses during active calls, logs every data access, checks commitment staleness, and pushes pre-meeting briefs. All outputs go to the pending workflows tray — no autonomous dispatch.

**Architecture:** BackgroundAgent (polling loop) → AgentStateManager (pause control) → [CalendarWatch, CommitmentStalenessChecker] → IPC push to renderer tray. PermissionsAuditLog records every access.

**Tech Stack:** TypeScript · Electron main process · setInterval · SQLite (better-sqlite3) · IPC

---

### Task 1: PermissionsAuditLog + schema

**Files:**
- Create `src/db/migrations/007_agent_audit_log.sql`
- Modify `src/db/schema.ts`
- Create `src/services/PermissionsAuditLog.ts`
- Create `src/services/__tests__/PermissionsAuditLog.test.ts`

- [ ] Step 1: Write migration SQL:
  ```sql
  CREATE TABLE IF NOT EXISTS agent_access_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    data_type   TEXT NOT NULL,
    accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    purpose     TEXT NOT NULL
  );
  ```
- [ ] Step 2: Register in `src/db/schema.ts`.
- [ ] Step 3: Write failing test — `PermissionsAuditLog.append({dataType: 'calendar', purpose: 'pre-meeting-brief'})` inserts a row; `queryRecent(10)` returns it.
- [ ] Step 4: Implement `PermissionsAuditLog.ts` with `append(entry)` and `queryRecent(limit)`.
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Commit — `feat(agent): add PermissionsAuditLog with agent_access_log table`

---

### Task 2: AgentStateManager

**Files:**
- Create `src/services/AgentStateManager.ts`
- Create `src/services/__tests__/AgentStateManager.test.ts`

- [ ] Step 1: Write failing test — after emitting `meeting:started` IPC event, `AgentStateManager.isPaused()` returns true; after `meeting:ended`, returns false.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `AgentStateManager.ts`:
  ```typescript
  class AgentStateManager {
    private _isCallActive = false;
    constructor() {
      ipcMain.on('meeting:started', () => { this._isCallActive = true; });
      ipcMain.on('meeting:ended', () => { this._isCallActive = false; });
    }
    isPaused(): boolean { return this._isCallActive; }
  }
  ```
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(agent): implement AgentStateManager with call-pause logic`

---

### Task 3: CommitmentStalenessChecker

**Files:**
- Create `src/services/CommitmentStalenessChecker.ts`
- Create `src/services/__tests__/CommitmentStalenessChecker.test.ts`

- [ ] Step 1: Write failing test — seeded ledger with 2 decisions (1 stale: meeting_date < today, dispatched_job_id null; 1 recent); `check()` returns array of length 1 containing the stale one.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `CommitmentStalenessChecker.check(): Decision[]`:
  ```typescript
  return ledgerQuery.queryOpenCommitments().filter(d => {
    const meetingDate = new Date(d.timestamp);
    return meetingDate < new Date() && !d.dispatched_job_id;
  });
  ```
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(agent): implement CommitmentStalenessChecker`

---

### Task 4: BackgroundAgent polling loop

**Files:**
- Create `src/services/BackgroundAgent.ts`
- Create `src/services/__tests__/BackgroundAgent.test.ts`

- [ ] Step 1: Write failing test — with mocked calendar returning 1 event in 4 minutes and `AgentStateManager.isPaused() = false`, `BackgroundAgent._runCycle()` emits `agent:pre-brief-ready` IPC event.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `BackgroundAgent.ts`:
  ```typescript
  class BackgroundAgent {
    private intervalMs: number;
    private timer: NodeJS.Timeout | null = null;

    start(intervalMs = 30 * 60 * 1000) {
      this.intervalMs = intervalMs;
      this.timer = setInterval(() => this._runCycle(), this.intervalMs);
    }

    async _runCycle() {
      if (this.stateManager.isPaused()) return;
      
      // 1. Calendar scan — look for events in next 5 minutes
      this.auditLog.append({ dataType: 'calendar', purpose: 'pre-meeting-scan' });
      const upcomingEvents = await this.calendarManager.getUpcomingEvents(5);
      
      for (const event of upcomingEvents) {
        const brief = await this.preMeetingLoader.buildPreBrief(event.id, null);
        mainWindow.webContents.send('agent:pre-brief-ready', brief);
      }

      // 2. Staleness check
      this.auditLog.append({ dataType: 'ledger', purpose: 'staleness-check' });
      const stale = this.stalenessChecker.check();
      if (stale.length > 0) {
        mainWindow.webContents.send('agent:stale-commitments', stale);
      }
    }

    stop() { if (this.timer) clearInterval(this.timer); }
    setInterval(ms: number) { this.stop(); this.start(ms); }
  }
  ```
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — `isPaused() = true` → `_runCycle()` returns immediately, no IPC events emitted, no audit log entries.
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Commit — `feat(agent): implement BackgroundAgent polling loop with pause and audit`

---

### Task 5: Startup registration + config

**Files:**
- Modify `src/main.ts`
- Create `src/config/agentConfig.ts`

- [ ] Step 1: In `src/main.ts`, after app ready: instantiate `BackgroundAgent`, call `agent.start(agentConfig.intervalMs)`.
- [ ] Step 2: Create `agentConfig.ts` reading `AGENT_POLL_INTERVAL_MS` from electron-store (default 30 min), with a settings IPC handler `agent:set-interval` that calls `agent.setInterval(ms)`.
- [ ] Step 3: Write test — IPC call `agent:set-interval` with 900000 (15 min) results in agent restarted with new interval.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(agent): register BackgroundAgent at app startup with configurable interval`

---

### Task 6: Integration test

**Files:**
- Create `src/__tests__/integration/backgroundAgent.test.ts`

- [ ] Step 1: Write integration test — mock calendar returning event 4 min away, mock `AgentStateManager.isPaused() = false`. Run `_runCycle()`. Assert: `agent:pre-brief-ready` IPC event emitted with correct meeting_id; `agent_access_log` has 2 rows (calendar + ledger); stale commitments IPC not emitted (ledger empty).
- [ ] Step 2: Run test — expect pass.
- [ ] Step 3: Write test — fire `meeting:started`, run `_runCycle()`. Assert no IPC events, no audit log entries.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `test(agent): add BackgroundAgent integration tests`
