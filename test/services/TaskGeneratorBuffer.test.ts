import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskGeneratorBuffer } from '../../electron/services/TaskGeneratorBuffer';
import { IpcEventBus, DecisionCapturedEvent } from '../../electron/services/IpcEventBus';

describe('TaskGeneratorBuffer', () => {
  let buffer: TaskGeneratorBuffer;

  beforeEach(() => {
    buffer = new TaskGeneratorBuffer();
  });

  afterEach(() => {
    buffer.destroy();
  });

  function emitDecision(overrides: Partial<DecisionCapturedEvent> = {}): DecisionCapturedEvent {
    const event: DecisionCapturedEvent = {
      type: 'commitment',
      speaker: 'Alice',
      timestamp: Date.now(),
      text_excerpt: "I'll handle it",
      confidence: 0.7,
      meeting_id: 'm1',
      turn_id: `t_${Math.random()}`,
      ...overrides,
    };
    IpcEventBus.emitTyped('decision:captured', event);
    return event;
  }

  it('accumulates decision:captured events', () => {
    emitDecision({ speaker: 'Alice' });
    emitDecision({ speaker: 'Bob' });
    emitDecision({ speaker: 'Carol' });

    const flushed = buffer.flush();
    expect(flushed).toHaveLength(3);
  });

  it('flush returns a copy (not the internal buffer)', () => {
    emitDecision();
    const flushed = buffer.flush();
    flushed.pop();
    expect(buffer.flush()).toHaveLength(1); // internal buffer unaffected
  });

  it('clear empties the buffer', () => {
    emitDecision();
    emitDecision();
    buffer.clear();
    expect(buffer.flush()).toHaveLength(0);
  });

  it('destroy stops listening to events', () => {
    buffer.destroy();
    emitDecision();
    expect(buffer.flush()).toHaveLength(0);
  });
});
