import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackgroundAgent, CalendarSource } from '../../electron/services/BackgroundAgent';
import { AgentStateManager } from '../../electron/services/AgentStateManager';
import { PermissionsAuditLog, AuditEntry } from '../../electron/services/PermissionsAuditLog';
import { CommitmentStalenessChecker, CommitmentQuerySource, OpenCommitment } from '../../electron/services/CommitmentStalenessChecker';
import { BrowserWindow } from 'electron';

// Track IPC sends via mock
const mockSend = vi.fn();
vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([
  { isDestroyed: () => false, webContents: { send: mockSend } } as any,
]);

// Minimal in-memory audit log for test
function createAuditLog(): PermissionsAuditLog {
  const entries: AuditEntry[] = [];
  return {
    append: (e: AuditEntry) => entries.push(e),
    queryRecent: (limit: number) => entries.slice(-limit).reverse().map((e, i) => ({
      id: i + 1,
      data_type: e.dataType,
      accessed_at: new Date().toISOString(),
      purpose: e.purpose,
    })),
    entries, // expose for assertions
  } as any;
}

describe('BackgroundAgent', () => {
  let stateManager: AgentStateManager;
  let auditLog: ReturnType<typeof createAuditLog>;
  let stalenessChecker: CommitmentStalenessChecker;
  let calendarSource: CalendarSource;
  let agent: BackgroundAgent;

  beforeEach(() => {
    mockSend.mockClear();
    stateManager = new AgentStateManager();
    auditLog = createAuditLog();

    const commitmentSource: CommitmentQuerySource = {
      queryOpenCommitments: () => [],
    };
    stalenessChecker = new CommitmentStalenessChecker(commitmentSource);

    calendarSource = {
      getUpcomingEvents: vi.fn().mockResolvedValue([]),
    };

    agent = new BackgroundAgent(stateManager, auditLog, stalenessChecker, calendarSource);
  });

  afterEach(() => {
    agent.stop();
    stateManager.dispose();
  });

  it('emits agent:pre-brief-ready for events starting within 5 minutes', async () => {
    const inFourMinutes = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    (calendarSource.getUpcomingEvents as any).mockResolvedValue([
      { id: 'evt-1', title: 'Standup', startTime: inFourMinutes, endTime: inFourMinutes, source: 'google' },
    ]);

    await agent._runCycle();

    expect(mockSend).toHaveBeenCalledWith('agent:pre-brief-ready', expect.objectContaining({
      meetingId: 'evt-1',
      title: 'Standup',
    }));
  });

  it('does not emit for events > 5 minutes away', async () => {
    const inTenMinutes = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    (calendarSource.getUpcomingEvents as any).mockResolvedValue([
      { id: 'evt-2', title: 'Later', startTime: inTenMinutes, endTime: inTenMinutes, source: 'google' },
    ]);

    await agent._runCycle();

    expect(mockSend).not.toHaveBeenCalledWith('agent:pre-brief-ready', expect.anything());
  });

  it('skips cycle when paused (meeting active)', async () => {
    const { IpcEventBus } = await import('../../electron/services/IpcEventBus');
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm1' });

    await agent._runCycle();

    expect(mockSend).not.toHaveBeenCalled();
    // No audit log entries when paused
    expect((auditLog as any).entries).toHaveLength(0);

    IpcEventBus.emitTyped('meeting:ended', { meeting_id: 'm1' });
  });

  it('logs calendar and ledger access in audit log', async () => {
    await agent._runCycle();

    const entries = (auditLog as any).entries as AuditEntry[];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ dataType: 'calendar', purpose: 'pre-meeting-scan' });
    expect(entries[1]).toEqual({ dataType: 'ledger', purpose: 'staleness-check' });
  });

  it('emits agent:stale-commitments when stale commitments exist', async () => {
    const staleCommitment: OpenCommitment = {
      id: 'c1',
      meetingId: 'm1',
      text: "I'll send the report",
      speaker: 'Alice',
      timestamp: Date.now() - 86_400_000,
      dispatchedJobId: null,
    };

    const source: CommitmentQuerySource = {
      queryOpenCommitments: () => [staleCommitment],
    };
    stalenessChecker = new CommitmentStalenessChecker(source);
    agent = new BackgroundAgent(stateManager, auditLog, stalenessChecker, calendarSource);

    await agent._runCycle();

    expect(mockSend).toHaveBeenCalledWith('agent:stale-commitments', [staleCommitment]);
  });

  it('setInterval updates the interval', () => {
    agent.start(60_000);
    expect(agent.getIntervalMs()).toBe(60_000);

    agent.setInterval(15_000);
    expect(agent.getIntervalMs()).toBe(15_000);
  });
});
