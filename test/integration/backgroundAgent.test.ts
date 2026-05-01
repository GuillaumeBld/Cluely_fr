import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import { AgentStateManager } from '../../electron/services/AgentStateManager';
import { PermissionsAuditLog } from '../../electron/services/PermissionsAuditLog';
import { CommitmentStalenessChecker, CommitmentQuerySource } from '../../electron/services/CommitmentStalenessChecker';
import { BackgroundAgent, CalendarSource } from '../../electron/services/BackgroundAgent';
import { IpcEventBus } from '../../electron/services/IpcEventBus';

const mockSend = vi.fn();
vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([
  { isDestroyed: () => false, webContents: { send: mockSend } } as any,
]);

describe('BackgroundAgent integration', () => {
  let db: Database.Database;
  let stateManager: AgentStateManager;
  let auditLog: PermissionsAuditLog;
  let stalenessChecker: CommitmentStalenessChecker;
  let calendarSource: CalendarSource;
  let agent: BackgroundAgent;

  beforeEach(() => {
    mockSend.mockClear();

    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE agent_access_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type   TEXT NOT NULL,
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        purpose     TEXT NOT NULL
      );
    `);

    stateManager = new AgentStateManager();
    auditLog = new PermissionsAuditLog(db);
  });

  afterEach(() => {
    agent?.stop();
    stateManager?.dispose();
    db?.close();
  });

  it('full cycle: calendar event within 5 min triggers pre-brief, audit log has 2 entries, no stale commitments IPC', async () => {
    const inFourMinutes = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    calendarSource = {
      getUpcomingEvents: vi.fn().mockResolvedValue([
        { id: 'evt-1', title: 'Standup', startTime: inFourMinutes, endTime: inFourMinutes, source: 'google' },
      ]),
    };

    const emptySource: CommitmentQuerySource = { queryOpenCommitments: () => [] };
    stalenessChecker = new CommitmentStalenessChecker(emptySource);
    agent = new BackgroundAgent(stateManager, auditLog, stalenessChecker, calendarSource);

    await agent._runCycle();

    // Pre-brief emitted
    expect(mockSend).toHaveBeenCalledWith('agent:pre-brief-ready', expect.objectContaining({
      meetingId: 'evt-1',
      title: 'Standup',
    }));

    // Audit log has 2 entries (calendar + ledger)
    const rows = auditLog.queryRecent(10);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.data_type)).toContain('calendar');
    expect(rows.map(r => r.data_type)).toContain('ledger');

    // No stale commitments IPC
    expect(mockSend).not.toHaveBeenCalledWith('agent:stale-commitments', expect.anything());
  });

  it('paused cycle: meeting:started causes _runCycle to skip entirely', async () => {
    calendarSource = {
      getUpcomingEvents: vi.fn().mockResolvedValue([]),
    };

    const emptySource: CommitmentQuerySource = { queryOpenCommitments: () => [] };
    stalenessChecker = new CommitmentStalenessChecker(emptySource);
    agent = new BackgroundAgent(stateManager, auditLog, stalenessChecker, calendarSource);

    // Pause via meeting event
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm1' });

    await agent._runCycle();

    // No IPC events
    expect(mockSend).not.toHaveBeenCalled();

    // No audit log entries
    const rows = auditLog.queryRecent(10);
    expect(rows).toHaveLength(0);

    // Cleanup
    IpcEventBus.emitTyped('meeting:ended', { meeting_id: 'm1' });
  });

  it('resumes after meeting:ended', async () => {
    const inFourMinutes = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    calendarSource = {
      getUpcomingEvents: vi.fn().mockResolvedValue([
        { id: 'evt-2', title: 'Retro', startTime: inFourMinutes, endTime: inFourMinutes, source: 'google' },
      ]),
    };

    const emptySource: CommitmentQuerySource = { queryOpenCommitments: () => [] };
    stalenessChecker = new CommitmentStalenessChecker(emptySource);
    agent = new BackgroundAgent(stateManager, auditLog, stalenessChecker, calendarSource);

    // Pause → skip
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm1' });
    await agent._runCycle();
    expect(mockSend).not.toHaveBeenCalled();

    // Resume → should work
    IpcEventBus.emitTyped('meeting:ended', { meeting_id: 'm1' });
    await agent._runCycle();
    expect(mockSend).toHaveBeenCalledWith('agent:pre-brief-ready', expect.objectContaining({
      meetingId: 'evt-2',
    }));
  });
});
