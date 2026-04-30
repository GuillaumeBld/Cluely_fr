import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PreMeetingOrchestrator } from '../../electron/services/PreMeetingOrchestrator';
import { HealthChunkWriter } from '../../electron/services/HealthChunkWriter';

// Mock EmailManager
vi.mock('../../electron/services/EmailManager', () => ({
  EmailManager: {
    getInstance: () => ({
      getMessagesFromSenders: vi.fn().mockResolvedValue(new Map()),
    }),
  },
}));

// Mock HealthSnapshotFetcher to simulate an HTTP endpoint
vi.mock('../../electron/services/HealthSnapshotFetcher', () => ({
  healthSnapshotFetcher: {
    fetchForProject: vi.fn(),
  },
  HealthSnapshotFetcher: vi.fn(),
}));

// Mock ProjectResolver to return a project
vi.mock('../../electron/services/ProjectResolver', () => ({
  projectResolver: {
    resolve: vi.fn().mockReturnValue({ projectId: 'qualiaai', confidence: 1 }),
  },
}));

describe('Health Injection Integration', () => {
  let db: Database.Database;
  let writer: HealthChunkWriter;
  let orchestrator: PreMeetingOrchestrator;
  let mockCalendarManager: any;
  let mockZoomWatcher: any;

  beforeEach(async () => {
    PreMeetingOrchestrator.resetInstance();

    db = new Database(':memory:');
    writer = new HealthChunkWriter(db);

    const eventStart = new Date(Date.now() + 4.5 * 60_000).toISOString();

    mockCalendarManager = {
      fetchUpcomingEvents: vi.fn().mockResolvedValue([{
        id: 'evt-health-1',
        title: 'qualiaai standup',
        startTime: eventStart,
        endTime: new Date(Date.now() + 5.5 * 60_000).toISOString(),
        source: 'google',
        attendees: ['dev@qualiaai.com'],
      }]),
    };

    mockZoomWatcher = { isZoomRunning: vi.fn().mockReturnValue(false) };

    orchestrator = PreMeetingOrchestrator.getInstance(
      mockCalendarManager as any,
      mockZoomWatcher as any,
    );
    orchestrator.setHealthChunkWriter(writer);
  });

  afterEach(() => {
    orchestrator.stop();
    PreMeetingOrchestrator.resetInstance();
    db.close();
  });

  it('writes health snapshot to KB when endpoint returns degraded status', async () => {
    const { healthSnapshotFetcher } = await import('../../electron/services/HealthSnapshotFetcher');
    vi.mocked(healthSnapshotFetcher.fetchForProject).mockResolvedValue({
      projectId: 'qualiaai',
      status: 'degraded',
      alerts: ['API timeout on /v2/infer'],
      blockers: [],
      fetchedAt: '2026-04-30T09:55:00Z',
    });

    const briefPromise = new Promise<any>(resolve => {
      orchestrator.on('pre-meeting:brief-ready', resolve);
    });

    await orchestrator.tick();
    await briefPromise;

    const chunks = writer.queryChunks({ projectId: 'qualiaai', chunkType: 'health-snapshot' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('degraded');
    expect(chunks[0].content).toContain('API timeout on /v2/infer');
    expect(chunks[0].projectId).toBe('qualiaai');
  });

  it('writes error summary when fetcher returns null (endpoint unreachable)', async () => {
    const { healthSnapshotFetcher } = await import('../../electron/services/HealthSnapshotFetcher');
    vi.mocked(healthSnapshotFetcher.fetchForProject).mockResolvedValue(null);

    const briefPromise = new Promise<any>(resolve => {
      orchestrator.on('pre-meeting:brief-ready', resolve);
    });

    await orchestrator.tick();
    await briefPromise;

    const chunks = writer.queryChunks({ projectId: 'qualiaai', chunkType: 'health-snapshot' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('unavailable');
    expect(chunks[0].content).toContain('Endpoint unreachable');
  });

  it('still emits brief-ready even when health injection fails', async () => {
    const { healthSnapshotFetcher } = await import('../../electron/services/HealthSnapshotFetcher');
    vi.mocked(healthSnapshotFetcher.fetchForProject).mockRejectedValue(new Error('catastrophic'));

    const briefPromise = new Promise<any>(resolve => {
      orchestrator.on('pre-meeting:brief-ready', resolve);
    });

    await orchestrator.tick();
    const brief = await briefPromise;

    expect(brief.eventId).toBe('evt-health-1');
    // No chunks written on error, but brief still fires
    const chunks = writer.queryChunks({ projectId: 'qualiaai' });
    expect(chunks).toHaveLength(0);
  });

  it('skips health injection when projectId is null', async () => {
    // Need a fresh orchestrator since the event ID was already fired
    PreMeetingOrchestrator.resetInstance();
    orchestrator = PreMeetingOrchestrator.getInstance(
      mockCalendarManager as any,
      mockZoomWatcher as any,
    );
    orchestrator.setHealthChunkWriter(writer);

    const { projectResolver } = await import('../../electron/services/ProjectResolver');
    vi.mocked(projectResolver.resolve).mockReturnValue({ projectId: null, confidence: 0 });

    const { healthSnapshotFetcher } = await import('../../electron/services/HealthSnapshotFetcher');
    vi.mocked(healthSnapshotFetcher.fetchForProject).mockClear();

    const briefPromise = new Promise<any>(resolve => {
      orchestrator.on('pre-meeting:brief-ready', resolve);
    });

    await orchestrator.tick();
    await briefPromise;

    expect(healthSnapshotFetcher.fetchForProject).not.toHaveBeenCalled();
  });
});
