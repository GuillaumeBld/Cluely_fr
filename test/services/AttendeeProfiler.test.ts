import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';
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

describe('AttendeeProfiler — memory graph enrichment', () => {
  let db: Database.Database;
  let mm: MemoryManager;

  function makeMockEmailManager() {
    return {
      getMessagesFromSenders: vi.fn().mockResolvedValue(new Map()),
    } as any;
  }

  beforeEach(() => {
    MemoryManager.resetInstance();
    db = new Database(':memory:');
    mm = MemoryManager.getInstance(db);
  });

  afterEach(() => {
    db.close();
    MemoryManager.resetInstance();
    vi.restoreAllMocks();
  });

  it('populates openItems from works_on edges', async () => {
    const person = mm.upsertNode('person', 'alice@example.com');
    const project = mm.upsertNode('project', 'Infra Upgrade');
    mm.proposeEdge(person.id, project.id, 'works_on', 0.9, null, '');

    const profiler = new AttendeeProfiler(makeMockEmailManager());
    const result = await profiler.profile(['alice@example.com']);

    expect(result[0].openItems).toEqual(['Infra Upgrade']);
    expect(result[0].priorDecisions).toEqual([]);
  });

  it('populates priorDecisions from decided edges', async () => {
    const person = mm.upsertNode('person', 'bob@example.com');
    const decision = mm.upsertNode('decision', 'Adopt TypeScript for new services');
    mm.proposeEdge(person.id, decision.id, 'decided', 0.9, null, '');

    const profiler = new AttendeeProfiler(makeMockEmailManager());
    const result = await profiler.profile(['bob@example.com']);

    expect(result[0].priorDecisions).toHaveLength(1);
    expect(result[0].priorDecisions[0]).toBe('Adopt TypeScript for new services');
  });

  it('populates priorDecisions from discussed edges', async () => {
    const person = mm.upsertNode('person', 'carol@example.com');
    const topic = mm.upsertNode('topic', 'Q4 roadmap priorities');
    mm.proposeEdge(person.id, topic.id, 'discussed', 0.9, null, '');

    const profiler = new AttendeeProfiler(makeMockEmailManager());
    const result = await profiler.profile(['carol@example.com']);

    expect(result[0].priorDecisions).toHaveLength(1);
    expect(result[0].priorDecisions[0]).toBe('Q4 roadmap priorities');
  });

  it('truncates priorDecision labels to 120 characters', async () => {
    const longLabel = 'A'.repeat(200);
    const person = mm.upsertNode('person', 'dave@example.com');
    const decision = mm.upsertNode('decision', longLabel);
    mm.proposeEdge(person.id, decision.id, 'decided', 0.9, null, '');

    const profiler = new AttendeeProfiler(makeMockEmailManager());
    const result = await profiler.profile(['dave@example.com']);

    expect(result[0].priorDecisions[0]).toHaveLength(120);
  });

  it('skips enrichment silently if MemoryManager throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(MemoryManager, 'getInstance').mockImplementation(() => {
      throw new Error('DB unavailable');
    });

    const profiler = new AttendeeProfiler(makeMockEmailManager());
    const result = await profiler.profile(['eve@example.com']);

    expect(result[0].openItems).toEqual([]);
    expect(result[0].priorDecisions).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Memory graph enrichment skipped'),
      expect.any(Error),
    );
  });

  it('returns empty openItems/priorDecisions when no person node exists', async () => {
    const profiler = new AttendeeProfiler(makeMockEmailManager());
    const result = await profiler.profile(['nobody@example.com']);

    expect(result[0].openItems).toEqual([]);
    expect(result[0].priorDecisions).toEqual([]);
  });
});
