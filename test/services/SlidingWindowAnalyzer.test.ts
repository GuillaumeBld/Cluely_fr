import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LunrIndexer } from '../../electron/services/LunrIndexer';
import { SlidingWindowAnalyzer } from '../../electron/services/SlidingWindowAnalyzer';
import { IpcEventBus, DecisionCapturedEvent } from '../../electron/services/IpcEventBus';

describe('SlidingWindowAnalyzer', () => {
  let indexer: LunrIndexer;
  let analyzer: SlidingWindowAnalyzer;
  let captured: DecisionCapturedEvent[];
  let handler: (e: DecisionCapturedEvent) => void;

  beforeEach(() => {
    indexer = new LunrIndexer();
    // Use a very large window and short interval (we'll call tick() manually)
    analyzer = new SlidingWindowAnalyzer(indexer, 600, 999_999);
    captured = [];
    handler = (e) => captured.push(e);
    IpcEventBus.onTyped('decision:captured', handler);
  });

  afterEach(() => {
    analyzer.stop();
    IpcEventBus.offTyped('decision:captured', handler);
  });

  it('emits decision:captured for commitment patterns', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: "I'll handle the migration", timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't2', speaker: 'Bob', text: 'The sky is blue', timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't3', speaker: 'Carol', text: 'You should send the report', timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't4', speaker: 'Dave', text: 'Thanks everyone', timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't5', speaker: 'Eve', text: 'See you tomorrow', timestamp: now, meeting_id: 'm1' });

    analyzer.start('m1');
    analyzer.tick();

    expect(captured).toHaveLength(2);
    expect(captured[0].type).toBe('commitment');
    expect(captured[0].speaker).toBe('Alice');
    expect(captured[1].type).toBe('ownership');
    expect(captured[1].speaker).toBe('Carol');
  });

  it('emits zero events for neutral turns', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'Hello everyone', timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't2', speaker: 'Bob', text: 'How are you?', timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't3', speaker: 'Carol', text: 'Nice weather', timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't4', speaker: 'Dave', text: 'I agree', timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't5', speaker: 'Eve', text: 'Sounds good', timestamp: now, meeting_id: 'm1' });

    analyzer.start('m1');
    analyzer.tick();

    expect(captured).toHaveLength(0);
  });

  it('deduplicates: same turn_id across two ticks emits only once', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: "I'll handle the migration", timestamp: now, meeting_id: 'm1' });

    analyzer.start('m1');
    analyzer.tick();
    analyzer.tick(); // second tick — same turn should NOT emit again

    expect(captured).toHaveLength(1);
  });

  it('detects deadline patterns', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'We need this by Friday', timestamp: now, meeting_id: 'm1' });

    analyzer.start('m1');
    analyzer.tick();

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('deadline');
  });

  it('detects unresolved patterns', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'This is still unresolved from last week', timestamp: now, meeting_id: 'm1' });

    analyzer.start('m1');
    analyzer.tick();

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('unresolved');
  });
});
