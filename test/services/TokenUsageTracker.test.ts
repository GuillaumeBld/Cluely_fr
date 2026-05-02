import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IpcEventBus } from '../../electron/services/IpcEventBus';
import { TokenUsageTracker } from '../../electron/services/TokenUsageTracker';

describe('TokenUsageTracker', () => {
  let tracker: TokenUsageTracker;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tracker = new TokenUsageTracker();
    emitSpy = vi.spyOn(IpcEventBus, 'emitTyped');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not emit when no active meeting', () => {
    tracker.record(10000);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('builds baseline without emitting for first 2 calls', () => {
    tracker.start('mtg-1');
    tracker.record(100);
    tracker.record(200);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('emits token:anomaly when count exceeds 2x rolling average', () => {
    tracker.start('mtg-1');
    tracker.record(100);
    tracker.record(100);
    tracker.record(500); // 500 > 2 * 100 = 200 → anomaly
    expect(emitSpy).toHaveBeenCalledWith('token:anomaly', expect.objectContaining({
      meeting_id: 'mtg-1',
      token_count: 500,
      rolling_avg: 100,
      threshold_multiple: 2,
    }));
  });

  it('does not emit when count is exactly 2x rolling average', () => {
    tracker.start('mtg-1');
    tracker.record(100);
    tracker.record(100);
    tracker.record(200); // 200 == 2 * 100 → not strictly greater, no anomaly
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('resets window on stop() + start()', () => {
    tracker.start('mtg-1');
    tracker.record(100);
    tracker.record(100);
    tracker.stop();
    tracker.start('mtg-2');
    tracker.record(1000); // window is empty after reset, only 1 entry → no anomaly
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('caps rolling window at windowSize', () => {
    tracker = new TokenUsageTracker(3); // windowSize=3 for this test
    tracker.start('mtg-1');
    tracker.record(100);
    tracker.record(100);
    tracker.record(100);
    tracker.record(100); // window still has 3 entries (oldest dropped)
    // Now inject a spike
    tracker.record(600); // 600 > 2 * 100 → anomaly
    expect(emitSpy).toHaveBeenCalledWith('token:anomaly', expect.objectContaining({
      token_count: 600,
    }));
  });
});
