# Cross-Session Background Agent (standalone)

## Problem & goal

The pipeline currently only activates during and immediately after a meeting. Between meetings, no ambient orchestration occurs: missing agendas go unnoticed, open commitments are not surfaced before the next related meeting, and the memory graph is not proactively kept fresh. This issue implements the inter-meeting background agent — the always-on orchestration layer that watches the calendar, polls commitments, and pushes pre-meeting briefs — as a standalone service beyond what Composite B already covers (pre-meeting loader). Standalone tasks: configurable polling loop, pause-during-calls mode, permissions audit log, and battery-conscious interval management.

## User story

While Guillaume is working between meetings, the background agent quietly monitors the calendar. Five minutes before a scheduled Zoom call, it composes a pre-meeting briefing card (attendees from memory graph, open commitments toward the detected goal, prior relevant decisions) and pushes it to the Launcher banner — without any user action. During active calls, the agent pauses its polling to avoid CPU contention. Guillaume never misses context because he forgot to check.

## Architecture

A `BackgroundAgent` service runs in the Electron main process as a setInterval loop (configurable: 15/30/60 min, default 30). It has three sub-tasks: (1) calendar scan (5-min-ahead window for upcoming events); (2) commitment staleness check (open ledger entries past their meeting date); (3) pre-brief push. A `AgentStateManager` tracks active-call status (subscribed to `meeting:started` / `meeting:ended` events) and pauses the loop when a call is active. A `PermissionsAuditLog` records every calendar/inbox access with timestamp and data type accessed. All outputs go to the Pending Workflows tray — no autonomous actions taken.

**Dependencies:** Composite A (memory graph), Composite D (LedgerQueryService), issue #15 (ApprovalTray for output), Composite B (pre-meeting loader for brief content assembly).

## Components (per-file responsibilities)

- `src/services/BackgroundAgent.ts` — Main polling loop; orchestrates sub-tasks; respects pause state.
- `src/services/AgentStateManager.ts` — Tracks `isCallActive` flag; subscribes to IPC meeting events; exposes `isPaused()`.
- `src/services/PermissionsAuditLog.ts` — Appends to `agent_access_log` SQLite table on every calendar/inbox read.
- `src/services/CommitmentStalenessChecker.ts` — Queries LedgerQueryService for open decisions past their associated meeting date; emits staleness alerts to pending workflows tray.
- `src/db/migrations/007_agent_audit_log.sql` — `agent_access_log` table.

## Data model

```sql
CREATE TABLE agent_access_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  data_type   TEXT NOT NULL, -- 'calendar' | 'inbox' | 'ledger'
  accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  purpose     TEXT NOT NULL  -- e.g. 'pre-meeting-brief', 'staleness-check'
);
```

## Error handling

- Calendar API failure: log error to `agent_access_log` with `data_type='calendar-error'`; skip this polling cycle; do not crash agent.
- Pre-brief assembly failure: push a degraded brief card ("Context unavailable") instead of silently failing.
- Agent loop exception: catch all, log, reset interval. Agent must never crash the main process.
- Pause during calls: `AgentStateManager.isPaused()` checked at the top of every polling cycle before any I/O.

## Testing approach

- Unit: `AgentStateManager` — assert `isPaused()` returns true after `meeting:started` event, false after `meeting:ended`.
- Unit: `CommitmentStalenessChecker` with seeded ledger; assert stale decisions (meeting_date < today) returned.
- Unit: `PermissionsAuditLog.append()` — assert row inserted with correct data_type and purpose.
- Integration: `BackgroundAgent` with mocked calendar returning 1 upcoming event in 4 minutes; assert pre-brief push IPC event emitted.
- Battery test: assert polling loop does not fire during active call (`isCallActive = true`).

## Success criteria

- Agent pauses all I/O within one polling cycle of `meeting:started` event.
- Every calendar or inbox read produces an entry in `agent_access_log`.
- Pre-meeting brief pushed to Launcher banner ≥ 5 minutes before each calendar event.
- Stale open commitments (no dispatch, meeting date past) surfaced in pending workflows tray.
- No autonomous dispatch — all outputs require user action in tray.
- Configurable interval respected: changing from 30 to 15 minutes takes effect within the next cycle.
