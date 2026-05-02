import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { BackgroundCostTracker } from '../../electron/services/BackgroundCostTracker';

describe('BackgroundCostTracker', () => {
  let tracker: BackgroundCostTracker;

  beforeEach(() => {
    const db = new Database(':memory:');
    tracker = new BackgroundCostTracker(db);
  });

  it('starts with zero usage', () => {
    expect(tracker.getDailyUsageCents()).toBe(0);
  });

  it('isOverBudget returns false when under budget', () => {
    tracker.recordUsage(100, 0.001);
    expect(tracker.isOverBudget(10)).toBe(false);
  });

  it('isOverBudget returns true when at or over budget', () => {
    tracker.recordUsage(100000, 10.5);
    expect(tracker.isOverBudget(10)).toBe(true);
  });

  it('accumulates usage within the same day', () => {
    tracker.recordUsage(500, 2.0);
    tracker.recordUsage(300, 1.5);
    expect(tracker.getDailyUsageCents()).toBeCloseTo(3.5);
  });
});
