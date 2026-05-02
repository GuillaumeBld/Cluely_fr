/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserWindow } from 'electron';

const mockSend = vi.fn();
vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([
  { isDestroyed: () => false, webContents: { send: mockSend } } as any,
]);

vi.mock('../../electron/config/HealthEndpointConfig', () => ({
  getAllEndpoints: vi.fn(() => ({
    'finbiz': { type: 'http', url: 'http://localhost:9101/health' },
    'qualiaai': { type: 'http', url: 'http://localhost:9102/health' },
  })),
}));

vi.mock('../../electron/services/HealthSnapshotFetcher', () => ({
  healthSnapshotFetcher: { fetchForProject: vi.fn() },
}));

vi.mock('../../electron/services/HealthSnapshotSerializer', () => ({
  serializeSnapshot: vi.fn((s: any) => `# ${s.projectId} Health — ${s.fetchedAt}\n\n**Status:** ${s.status}`),
  serializeError: vi.fn((id: string, err: string) => `# ${id} Health — error\n\n**Status:** unavailable\n\n${err}`),
}));

import { DashboardPoller } from '../../electron/services/DashboardPoller';
import { healthSnapshotFetcher } from '../../electron/services/HealthSnapshotFetcher';

const mockFetchForProject = healthSnapshotFetcher.fetchForProject as ReturnType<typeof vi.fn>;

describe('DashboardPoller', () => {
  let poller: DashboardPoller;
  const mockWriteChunk = vi.fn();
  const mockGetLatestChunk = vi.fn();
  const mockWriter = {
    writeChunk: mockWriteChunk,
    getLatestChunk: mockGetLatestChunk,
  } as any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSend.mockClear();
    mockFetchForProject.mockReset();
    mockWriteChunk.mockReset();
    mockGetLatestChunk.mockReset();
    poller = new DashboardPoller(mockWriter, 60_000);
  });

  afterEach(() => {
    poller.stop();
    vi.useRealTimers();
  });

  it('triggerCycle fetches all configured projects and broadcasts', async () => {
    const snap1 = { projectId: 'finbiz', status: 'healthy', alerts: [], blockers: [], fetchedAt: '2026-05-01T10:00:00Z' };
    const snap2 = { projectId: 'qualiaai', status: 'degraded', alerts: ['high latency'], blockers: [], fetchedAt: '2026-05-01T10:00:00Z' };
    mockFetchForProject.mockResolvedValueOnce(snap1).mockResolvedValueOnce(snap2);
    mockGetLatestChunk
      .mockReturnValueOnce({ projectId: 'finbiz', content: '# Finbiz', fetchedAt: snap1.fetchedAt, stale: false })
      .mockReturnValueOnce({ projectId: 'qualiaai', content: '# Qualiaai', fetchedAt: snap2.fetchedAt, stale: false });

    await poller.triggerCycle();

    expect(mockFetchForProject).toHaveBeenCalledTimes(2);
    expect(mockFetchForProject).toHaveBeenCalledWith('finbiz');
    expect(mockFetchForProject).toHaveBeenCalledWith('qualiaai');
    expect(mockWriteChunk).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledWith('dashboard:snapshots-updated', expect.any(Array));
    expect(mockSend.mock.calls[0][1]).toHaveLength(2);
  });

  it('triggerCycle handles partial fetch failures gracefully', async () => {
    mockFetchForProject
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ projectId: 'qualiaai', status: 'healthy', alerts: [], blockers: [], fetchedAt: '2026-05-01T10:00:00Z' });
    mockGetLatestChunk
      .mockReturnValueOnce({ projectId: 'finbiz', content: '# error', fetchedAt: '2026-05-01T10:00:00Z', stale: false })
      .mockReturnValueOnce({ projectId: 'qualiaai', content: '# ok', fetchedAt: '2026-05-01T10:00:00Z', stale: false });

    await poller.triggerCycle();

    expect(mockSend).toHaveBeenCalledWith('dashboard:snapshots-updated', expect.any(Array));
    expect(mockSend.mock.calls[0][1]).toHaveLength(2);
  });

  it('start() triggers immediate triggerCycle', async () => {
    const spy = vi.spyOn(poller, 'triggerCycle').mockResolvedValue();
    poller.start();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('setInterval() restarts with new interval', () => {
    const spy = vi.spyOn(poller, 'triggerCycle').mockResolvedValue();
    poller.start(60_000);

    expect(poller.getIntervalMs()).toBe(60_000);
    poller.setInterval(30_000);
    expect(poller.getIntervalMs()).toBe(30_000);

    // Should have restarted (called triggerCycle again from start)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('stop() clears the timer', () => {
    vi.spyOn(poller, 'triggerCycle').mockResolvedValue();
    poller.start();
    poller.stop();

    // Advancing time should not trigger another cycle
    const callCount = (poller.triggerCycle as any).mock.calls.length;
    vi.advanceTimersByTime(120_000);
    expect((poller.triggerCycle as any).mock.calls.length).toBe(callCount);
  });

  it('triggerCycle handles fulfilled-with-null (no data) branch', async () => {
    mockFetchForProject.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockGetLatestChunk.mockReturnValue(null);

    await poller.triggerCycle();

    // serializeError called for each null result, writeChunk called twice
    expect(mockWriteChunk).toHaveBeenCalledTimes(2);
    // broadcast still fires (with empty snapshots since getLatestChunk returns null)
    expect(mockSend).toHaveBeenCalledWith('dashboard:snapshots-updated', []);
  });

  it('broadcast skips destroyed windows', async () => {
    const mockSendDestroyed = vi.fn();
    vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValueOnce([
      { isDestroyed: () => true, webContents: { send: mockSendDestroyed } } as any,
      { isDestroyed: () => false, webContents: { send: mockSend } } as any,
    ]);

    mockFetchForProject.mockResolvedValue({ projectId: 'finbiz', status: 'healthy', alerts: [], blockers: [], fetchedAt: '2026-05-01T10:00:00Z' });
    mockGetLatestChunk.mockReturnValue({ projectId: 'finbiz', content: '# ok', fetchedAt: '2026-05-01T10:00:00Z', stale: false });

    await poller.triggerCycle();

    expect(mockSendDestroyed).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith('dashboard:snapshots-updated', expect.any(Array));
  });

  it('setInterval() before start() is a no-op for timer restart', () => {
    const spy = vi.spyOn(poller, 'triggerCycle').mockResolvedValue();
    poller.setInterval(30_000);
    // No timer running, so setInterval should only update the interval value, not call triggerCycle
    expect(spy).not.toHaveBeenCalled();
    expect(poller.getIntervalMs()).toBe(30_000);
  });
});
