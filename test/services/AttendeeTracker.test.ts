import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { IpcEventBus } from '../../electron/services/IpcEventBus';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { AttendeeTracker } from '../../electron/services/AttendeeTracker';
import { LunrIndexer, SpeakerTurn } from '../../electron/services/LunrIndexer';

describe('AttendeeTracker', () => {
  let tracker: AttendeeTracker;
  let db: Database.Database;
  let mm: MemoryManager;
  let mockIndexer: LunrIndexer;

  beforeEach(() => {
    vi.useFakeTimers();

    MemoryManager.resetInstance();
    db = new Database(':memory:');
    mm = MemoryManager.getInstance(db);

    mockIndexer = {
      allTurns: vi.fn().mockReturnValue([]),
    } as any;

    tracker = new AttendeeTracker(mockIndexer);
  });

  afterEach(() => {
    tracker.destroy();
    db.close();
    MemoryManager.resetInstance();
    vi.useRealTimers();
  });

  function startMeeting() {
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'meeting-1' });
  }

  function makeTurn(speaker: string): SpeakerTurn {
    return {
      turn_id: `turn-${Math.random()}`,
      speaker,
      text: 'some text',
      timestamp: Date.now(),
      meeting_id: 'meeting-1',
    };
  }

  it('subscribes to meeting:started and meeting:ended on construction', () => {
    const onSpy = vi.spyOn(IpcEventBus, 'onTyped');
    const t = new AttendeeTracker(mockIndexer);

    expect(onSpy).toHaveBeenCalledWith('meeting:started', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('meeting:ended', expect.any(Function));

    t.destroy();
    onSpy.mockRestore();
  });

  it('tick detects new speakers and enriches them', () => {
    (mockIndexer.allTurns as ReturnType<typeof vi.fn>).mockReturnValue([
      makeTurn('Alice'),
      makeTurn('Bob'),
    ]);

    startMeeting();
    vi.advanceTimersByTime(5000);

    const attendees = tracker.getAttendees();
    expect(attendees).toHaveLength(2);
    expect(attendees.map(a => a.speaker).sort()).toEqual(['Alice', 'Bob']);
  });

  it('enrich upserts person node in MemoryManager', () => {
    (mockIndexer.allTurns as ReturnType<typeof vi.fn>).mockReturnValue([
      makeTurn('Carol'),
    ]);

    startMeeting();
    vi.advanceTimersByTime(5000);

    const nodes = mm.findNodes('person', 'Carol');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe('Carol');
  });

  it('enrich with empty edges returns card with no relations', () => {
    (mockIndexer.allTurns as ReturnType<typeof vi.fn>).mockReturnValue([
      makeTurn('Dave'),
    ]);

    startMeeting();
    vi.advanceTimersByTime(5000);

    const cards = tracker.getAttendees();
    expect(cards).toHaveLength(1);
    expect(cards[0].speaker).toBe('Dave');
    expect(cards[0].relations).toEqual([]);
  });

  it('enrich includes relevant edges as relations', () => {
    const person = mm.upsertNode('person', 'Eve');
    const project = mm.upsertNode('project', 'Infra');
    mm.proposeEdge(person.id, project.id, 'works_on', 0.9, 'meeting-0', 'Eve works on Infra');

    (mockIndexer.allTurns as ReturnType<typeof vi.fn>).mockReturnValue([
      makeTurn('Eve'),
    ]);

    startMeeting();
    vi.advanceTimersByTime(5000);

    const cards = tracker.getAttendees();
    expect(cards).toHaveLength(1);
    expect(cards[0].relations.length).toBeGreaterThanOrEqual(1);
    expect(cards[0].relations[0].predicate).toBe('works_on');
    expect(cards[0].relations[0].targetLabel).toBe('Infra');
  });

  it('enrich catches MemoryManager errors without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(mm, 'upsertNode').mockImplementation(() => { throw new Error('DB locked'); });

    (mockIndexer.allTurns as ReturnType<typeof vi.fn>).mockReturnValue([
      makeTurn('Frank'),
    ]);

    startMeeting();
    vi.advanceTimersByTime(5000);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('enrich skipped'),
      expect.any(Error),
    );

    expect(tracker.getAttendees()).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('getAttendees returns empty before any meeting', () => {
    expect(tracker.getAttendees()).toEqual([]);
  });

  it('start clears previous attendees on new meeting', () => {
    (mockIndexer.allTurns as ReturnType<typeof vi.fn>).mockReturnValue([
      makeTurn('Grace'),
    ]);

    startMeeting();
    vi.advanceTimersByTime(5000);

    expect(tracker.getAttendees()).toHaveLength(1);

    // Start a new meeting — attendees should be cleared
    (mockIndexer.allTurns as ReturnType<typeof vi.fn>).mockReturnValue([]);
    startMeeting();
    expect(tracker.getAttendees()).toHaveLength(0);
  });

  it('destroy unsubscribes from IpcEventBus', () => {
    const offSpy = vi.spyOn(IpcEventBus, 'offTyped');
    tracker.destroy();

    expect(offSpy).toHaveBeenCalledWith('meeting:started', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('meeting:ended', expect.any(Function));

    offSpy.mockRestore();
  });
});
