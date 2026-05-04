import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MeetingCostTracker } from '../../electron/services/MeetingCostTracker';

describe('MeetingCostTracker', () => {
  let tracker: MeetingCostTracker;

  beforeEach(() => {
    const db = new Database(':memory:');
    tracker = new MeetingCostTracker(db);
  });

  it('starts with zero spend for unknown meeting', () => {
    const spend = tracker.getMeetingSpend('mtg-x');
    expect(spend.totalCents).toBe(0);
    expect(spend.byModel).toHaveLength(0);
  });

  it('records and aggregates meeting spend', () => {
    tracker.record({ meetingId: 'mtg-1', provider: 'groq', model: 'llama-3.3-70b-versatile', inputTokens: 100, outputTokens: 50, costCents: 1.2 });
    tracker.record({ meetingId: 'mtg-1', provider: 'claude', model: 'claude-sonnet-4-5', inputTokens: 200, outputTokens: 100, costCents: 2.1 });
    const spend = tracker.getMeetingSpend('mtg-1');
    expect(spend.totalCents).toBeCloseTo(3.3);
    expect(spend.byModel).toHaveLength(2);
  });

  it('isolates meetings from each other', () => {
    tracker.record({ meetingId: 'mtg-1', provider: 'groq', model: 'llama-3.3-70b-versatile', inputTokens: 100, outputTokens: 50, costCents: 5.0 });
    tracker.record({ meetingId: 'mtg-2', provider: 'groq', model: 'llama-3.3-70b-versatile', inputTokens: 100, outputTokens: 50, costCents: 3.0 });
    expect(tracker.getMeetingSpend('mtg-1').totalCents).toBeCloseTo(5.0);
    expect(tracker.getMeetingSpend('mtg-2').totalCents).toBeCloseTo(3.0);
  });

  it('records null meetingId (background agent calls)', () => {
    tracker.record({ meetingId: null, provider: 'openai', model: 'gpt-5.2-chat-latest', inputTokens: 500, outputTokens: 200, costCents: 4.5 });
    // Should not appear in meeting spend
    expect(tracker.getMeetingSpend('').totalCents).toBe(0);
    // Should appear in daily spend
    const daily = tracker.getDailySpend();
    expect(daily.totalCents).toBeCloseTo(4.5);
  });

  it('getDailySpend aggregates all calls for today', () => {
    tracker.record({ meetingId: 'mtg-1', provider: 'groq', model: 'llama-3.3-70b-versatile', inputTokens: 100, outputTokens: 50, costCents: 1.0 });
    tracker.record({ meetingId: 'mtg-2', provider: 'claude', model: 'claude-sonnet-4-5', inputTokens: 200, outputTokens: 100, costCents: 2.0 });
    tracker.record({ meetingId: null, provider: 'openai', model: 'gpt-5.2-chat-latest', inputTokens: 300, outputTokens: 150, costCents: 3.0 });
    const daily = tracker.getDailySpend();
    expect(daily.totalCents).toBeCloseTo(6.0);
    expect(daily.byModel).toHaveLength(3);
  });

  it('isOverDailyBudget returns true when exceeded', () => {
    tracker.record({ meetingId: null, provider: 'openai', model: 'gpt-5.2-chat-latest', inputTokens: 1000, outputTokens: 500, costCents: 15.0 });
    expect(tracker.isOverDailyBudget(10)).toBe(true);
    expect(tracker.isOverDailyBudget(20)).toBe(false);
  });

  it('isOverDailyBudget returns true when exactly at budget', () => {
    tracker.record({ meetingId: null, provider: 'openai', model: 'gpt-5.2-chat-latest', inputTokens: 1000, outputTokens: 500, costCents: 10.0 });
    expect(tracker.isOverDailyBudget(10)).toBe(true);
  });
});
