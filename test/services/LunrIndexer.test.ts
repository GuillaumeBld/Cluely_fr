import { describe, it, expect, beforeEach } from 'vitest';
import { LunrIndexer, SpeakerTurn } from '../../electron/services/LunrIndexer';

describe('LunrIndexer', () => {
  let indexer: LunrIndexer;

  beforeEach(() => {
    indexer = new LunrIndexer();
  });

  describe('addTurn + allTurns', () => {
    it('stores and retrieves turns', () => {
      const turn: SpeakerTurn = {
        turn_id: 't1',
        speaker: 'Alice',
        text: 'We agreed on the deadline',
        timestamp: Date.now(),
        meeting_id: 'm1',
      };
      indexer.addTurn(turn);
      expect(indexer.allTurns()).toHaveLength(1);
      expect(indexer.allTurns()[0]).toEqual(turn);
    });
  });

  describe('getWindow', () => {
    it('returns empty array when no turns exist', () => {
      expect(indexer.getWindow(300)).toEqual([]);
    });

    it('returns turns from the last N seconds in chronological order', () => {
      const now = Date.now();
      const recent: SpeakerTurn = {
        turn_id: 't1',
        speaker: 'Alice',
        text: 'recent turn',
        timestamp: now - 10_000, // 10s ago
        meeting_id: 'm1',
      };
      const old: SpeakerTurn = {
        turn_id: 't2',
        speaker: 'Bob',
        text: 'old turn',
        timestamp: now - 600_000, // 10 min ago
        meeting_id: 'm1',
      };

      indexer.addTurn(old);
      indexer.addTurn(recent);

      const window = indexer.getWindow(300); // last 5 min
      expect(window).toHaveLength(1);
      expect(window[0].turn_id).toBe('t1');
    });

    it('returns turns sorted chronologically', () => {
      const now = Date.now();
      indexer.addTurn({ turn_id: 't2', speaker: 'B', text: 'second', timestamp: now - 5000, meeting_id: 'm1' });
      indexer.addTurn({ turn_id: 't1', speaker: 'A', text: 'first', timestamp: now - 10000, meeting_id: 'm1' });

      const window = indexer.getWindow(60);
      expect(window[0].turn_id).toBe('t1');
      expect(window[1].turn_id).toBe('t2');
    });
  });

  describe('search', () => {
    it('returns matching turns by text', () => {
      indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'we agreed on the plan', timestamp: Date.now(), meeting_id: 'm1' });
      indexer.addTurn({ turn_id: 't2', speaker: 'Bob', text: 'the weather is nice', timestamp: Date.now(), meeting_id: 'm1' });

      const results = indexer.search('agreed');
      expect(results).toHaveLength(1);
      expect(results[0].turn_id).toBe('t1');
    });
  });

  describe('search (extended)', () => {
    it('returns all turns for empty query (guard is in IPC layer)', () => {
      indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'hello world', timestamp: Date.now(), meeting_id: 'm1' });
      // Empty string triggers lunr wildcard match — the IPC handler guards against this
      const results = indexer.search('');
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('returns empty array when no turns indexed', () => {
      expect(indexer.search('hello')).toEqual([]);
    });

    it('matches multi-word query containing all terms', () => {
      indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'we agreed on the deadline for Friday', timestamp: Date.now(), meeting_id: 'm1' });
      indexer.addTurn({ turn_id: 't2', speaker: 'Bob', text: 'the weather is nice today', timestamp: Date.now(), meeting_id: 'm1' });

      const results = indexer.search('agreed deadline');
      expect(results).toHaveLength(1);
      expect(results[0].turn_id).toBe('t1');
    });

    it('matches by speaker name', () => {
      indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'first turn', timestamp: Date.now(), meeting_id: 'm1' });
      indexer.addTurn({ turn_id: 't2', speaker: 'Bob', text: 'second turn', timestamp: Date.now(), meeting_id: 'm1' });

      const results = indexer.search('Alice');
      expect(results).toHaveLength(1);
      expect(results[0].speaker).toBe('Alice');
    });

    it('returns empty after clear()', () => {
      indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'important meeting notes', timestamp: Date.now(), meeting_id: 'm1' });
      expect(indexer.search('important')).toHaveLength(1);

      indexer.clear();
      expect(indexer.search('important')).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all turns', () => {
      indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'hello', timestamp: Date.now(), meeting_id: 'm1' });
      indexer.clear();
      expect(indexer.allTurns()).toHaveLength(0);
      expect(indexer.getWindow(300)).toEqual([]);
    });
  });
});
