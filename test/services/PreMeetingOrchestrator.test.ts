import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PreMeetingOrchestrator } from '../../electron/services/PreMeetingOrchestrator';

// Mock EmailManager so constructor doesn't fail
vi.mock('../../electron/services/EmailManager', () => ({
  EmailManager: {
    getInstance: () => ({
      getMessagesFromSenders: vi.fn().mockResolvedValue(new Map()),
    }),
  },
}));

describe('PreMeetingOrchestrator', () => {
  let orchestrator: PreMeetingOrchestrator;
  let mockCalendarManager: any;
  let mockZoomWatcher: any;

  beforeEach(() => {
    PreMeetingOrchestrator.resetInstance();

    // Event starting 4.5 minutes from now (within the 5 ± 1 min window)
    const eventStart = new Date(Date.now() + 4.5 * 60_000).toISOString();

    mockCalendarManager = {
      fetchUpcomingEvents: vi.fn().mockResolvedValue([
        {
          id: 'evt-test-1',
          title: 'daily standup',
          startTime: eventStart,
          endTime: new Date(Date.now() + 5.5 * 60_000).toISOString(),
          source: 'google',
          attendees: ['alice@example.com'],
        },
      ]),
    };

    mockZoomWatcher = {
      isZoomRunning: vi.fn().mockReturnValue(false),
    };

    orchestrator = PreMeetingOrchestrator.getInstance(
      mockCalendarManager as any,
      mockZoomWatcher as any,
    );
  });

  afterEach(() => {
    orchestrator.stop();
    PreMeetingOrchestrator.resetInstance();
  });

  it('emits pre-meeting:brief-ready for an event within the lead-time window', async () => {
    const briefPromise = new Promise<any>(resolve => {
      orchestrator.on('pre-meeting:brief-ready', resolve);
    });

    await orchestrator.tick();
    const brief = await briefPromise;

    expect(brief.eventId).toBe('evt-test-1');
    expect(brief.templateId).toBe('standup');
    expect(brief.attendees).toHaveLength(1);
  });

  it('does not emit duplicate brief for the same event ID', async () => {
    const emitSpy = vi.fn();
    orchestrator.on('pre-meeting:brief-ready', emitSpy);

    await orchestrator.tick();
    await orchestrator.tick();

    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('skips tick when Zoom is running', async () => {
    mockZoomWatcher.isZoomRunning.mockReturnValue(true);
    const emitSpy = vi.fn();
    orchestrator.on('pre-meeting:brief-ready', emitSpy);

    await orchestrator.tick();

    expect(emitSpy).not.toHaveBeenCalled();
    expect(mockCalendarManager.fetchUpcomingEvents).not.toHaveBeenCalled();
  });

  it('stores last brief and returns it via getLastBrief()', async () => {
    expect(orchestrator.getLastBrief()).toBeNull();

    const briefPromise = new Promise<any>(resolve => {
      orchestrator.on('pre-meeting:brief-ready', resolve);
    });

    await orchestrator.tick();
    await briefPromise;

    const brief = orchestrator.getLastBrief();
    expect(brief).not.toBeNull();
    expect(brief!.eventId).toBe('evt-test-1');
  });

  it('does not emit for events outside the lead-time window', async () => {
    // Event starting 20 minutes from now (outside 5 ± 1 min)
    mockCalendarManager.fetchUpcomingEvents.mockResolvedValue([
      {
        id: 'evt-far',
        title: 'far away meeting',
        startTime: new Date(Date.now() + 20 * 60_000).toISOString(),
        endTime: new Date(Date.now() + 21 * 60_000).toISOString(),
        source: 'google',
      },
    ]);

    const emitSpy = vi.fn();
    orchestrator.on('pre-meeting:brief-ready', emitSpy);

    await orchestrator.tick();

    expect(emitSpy).not.toHaveBeenCalled();
  });
});
