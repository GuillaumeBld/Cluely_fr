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

  it('respects custom anomalyMultiple constructor param', () => {
    tracker = new TokenUsageTracker(10, 3.0); // 3× threshold
    tracker.start('mtg-1');
    tracker.record(100);
    tracker.record(100);
    tracker.record(250); // 250 < 3 * 100 = 300 → no anomaly
    expect(emitSpy).not.toHaveBeenCalled();
    tracker.record(400); // 400 > 3 * (100+100+250)/3 ≈ 3 * 150 = 450? no — window is [100,100,250], mean=150, 3*150=450 → no anomaly
    expect(emitSpy).not.toHaveBeenCalled();
    tracker.record(600); // window=[100,100,250,400], mean=212.5, 3*212.5=637.5 → 600 < 637.5, no anomaly
    expect(emitSpy).not.toHaveBeenCalled();
    tracker.record(700); // window=[100,100,250,400,600], mean=290, 3*290=870 → no anomaly
    expect(emitSpy).not.toHaveBeenCalled();
    tracker.record(1000); // window=[100,100,250,400,600,700], mean≈358, 3*358≈1075 → no anomaly
    expect(emitSpy).not.toHaveBeenCalled();
    // fresh tracker for clean threshold test
    tracker = new TokenUsageTracker(10, 3.0);
    vi.spyOn(IpcEventBus, 'emitTyped').mockImplementation(() => {});
    emitSpy = vi.spyOn(IpcEventBus, 'emitTyped');
    tracker.start('mtg-2');
    tracker.record(100);
    tracker.record(100);
    tracker.record(400); // 400 > 3 * 100 = 300 → anomaly
    expect(emitSpy).toHaveBeenCalledWith('token:anomaly', expect.objectContaining({
      token_count: 400,
      threshold_multiple: 3,
    }));
  });

  it('does not record zero-token counts', () => {
    tracker.start('mtg-1');
    tracker.record(100);
    tracker.record(100);
    tracker.record(0); // zero count — should be ignored, not added to window
    // window is still [100, 100]; a normal value should not trigger anomaly
    tracker.record(150); // 150 < 2 * 100 = 200 → no anomaly
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
