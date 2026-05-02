import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { IpcEventBus, DecisionCapturedEvent } from '../../electron/services/IpcEventBus';
import { MemoryManager } from '../../electron/memory/MemoryManager';
import { MemoryGraphWriter } from '../../electron/services/MemoryGraphWriter';

describe('MemoryGraphWriter', () => {
  let writer: MemoryGraphWriter;
  let db: Database.Database;
  let mm: MemoryManager;

  beforeEach(() => {
    MemoryManager.resetInstance();
    db = new Database(':memory:');
    mm = MemoryManager.getInstance(db);
    writer = new MemoryGraphWriter();
  });

  afterEach(() => {
    writer.destroy();
    db.close();
    MemoryManager.resetInstance();
  });

  function emitDecision(overrides: Partial<DecisionCapturedEvent> = {}) {
    IpcEventBus.emitTyped('decision:captured', {
      type: 'commitment',
      speaker: 'Alice',
      timestamp: Date.now(),
      text_excerpt: 'will send the report by Friday',
      confidence: 0.8,
      meeting_id: 'meeting-1',
      turn_id: 'turn-1',
      ...overrides,
    });
  }

  it('calls proposeEdge for a commitment event', () => {
    const spy = vi.spyOn(mm, 'proposeEdge');
    emitDecision({ type: 'commitment', confidence: 0.8 });

    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'owes',
      0.8,
      'meeting-1',
      'will send the report by Friday',
    );
  });

  it('creates person and commitment nodes via upsertNode', () => {
    emitDecision({ type: 'commitment', speaker: 'Bob' });

    const people = mm.findNodes('person', 'Bob');
    expect(people).toHaveLength(1);

    const commitments = mm.findNodes('commitment');
    expect(commitments).toHaveLength(1);
  });

  it('routes high-confidence event to edges table', () => {
    emitDecision({ type: 'ownership', confidence: 0.9, speaker: 'Carol' });

    const person = mm.findNodes('person', 'Carol')[0];
    const edges = mm.getEdgesFrom(person.id);
    expect(edges).toHaveLength(1);
    expect(edges[0].predicate).toBe('works_on');
  });

  it('routes low-confidence event to pending_review', () => {
    emitDecision({ type: 'deadline', confidence: 0.5 });

    const pending = mm.getPendingReview();
    expect(pending).toHaveLength(1);
    expect(pending[0].predicate).toBe('owes');
    expect(pending[0].confidence).toBe(0.5);
  });

  it('maps unresolved type to discussed predicate', () => {
    const spy = vi.spyOn(mm, 'proposeEdge');
    emitDecision({ type: 'unresolved', confidence: 0.75 });

    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'discussed',
      0.75,
      'meeting-1',
      expect.any(String),
    );
  });

  it('unsubscribes on destroy', () => {
    const spy = vi.spyOn(mm, 'proposeEdge');
    writer.destroy();

    emitDecision();

    expect(spy).not.toHaveBeenCalled();
  });

  it('handles MemoryManager errors gracefully', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(mm, 'upsertNode').mockImplementation(() => { throw new Error('DB locked'); });

    emitDecision();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('write skipped'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('truncates long text_excerpt for target label', () => {
    const longText = 'a'.repeat(200);
    emitDecision({ text_excerpt: longText });

    const commitments = mm.findNodes('commitment');
    expect(commitments).toHaveLength(1);
    expect(commitments[0].label).toHaveLength(120);
  });
});
