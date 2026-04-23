import { describe, it, expect, vi } from 'vitest';
import { AttendeeProfiler } from '../../electron/services/AttendeeProfiler';

describe('AttendeeProfiler', () => {
  it('returns profiles with recent emails from EmailManager', async () => {
    const mockEmails = [
      { subject: 'Re: Q4 planning', sender: 'alice@example.com', date: '2026-04-20', snippet: 'Sounds good', mailbox: 'INBOX' },
      { subject: 'Budget update', sender: 'alice@example.com', date: '2026-04-19', snippet: 'Here is the budget', mailbox: 'INBOX' },
      { subject: 'Follow up', sender: 'alice@example.com', date: '2026-04-18', snippet: 'Following up', mailbox: 'INBOX' },
    ];

    const mockEmailManager = {
      getMessagesFromSenders: vi.fn().mockResolvedValue(
        new Map([['alice@example.com', mockEmails]])
      ),
    } as any;

    const profiler = new AttendeeProfiler(mockEmailManager);
    const result = await profiler.profile(['alice@example.com']);

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('alice@example.com');
    expect(result[0].recentEmails).toHaveLength(3);
    expect(result[0].openItems).toEqual([]);
    expect(result[0].priorDecisions).toEqual([]);
  });

  it('returns empty array for empty email list', async () => {
    const mockEmailManager = {
      getMessagesFromSenders: vi.fn(),
    } as any;

    const profiler = new AttendeeProfiler(mockEmailManager);
    const result = await profiler.profile([]);

    expect(result).toEqual([]);
    expect(mockEmailManager.getMessagesFromSenders).not.toHaveBeenCalled();
  });

  it('returns empty recentEmails for unknown attendee', async () => {
    const mockEmailManager = {
      getMessagesFromSenders: vi.fn().mockResolvedValue(new Map()),
    } as any;

    const profiler = new AttendeeProfiler(mockEmailManager);
    const result = await profiler.profile(['unknown@example.com']);

    expect(result).toHaveLength(1);
    expect(result[0].recentEmails).toEqual([]);
  });
});
