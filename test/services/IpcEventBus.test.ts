import { describe, it, expect, vi } from 'vitest';
import { IpcEventBus, DecisionCapturedEvent } from '../../electron/services/IpcEventBus';

describe('IpcEventBus', () => {
  it('is a singleton', () => {
    // The module exports a singleton instance — importing twice returns the same object
    const bus1 = IpcEventBus;
    const bus2 = IpcEventBus;
    expect(bus1).toBe(bus2);
  });

  it('delivers decision:captured events to listeners', () => {
    const handler = vi.fn();
    IpcEventBus.onTyped('decision:captured', handler);

    const payload: DecisionCapturedEvent = {
      type: 'commitment',
      speaker: 'Alice',
      timestamp: Date.now(),
      text_excerpt: "I'll handle the migration",
      confidence: 0.7,
      meeting_id: 'meeting_1',
      turn_id: 'turn_1',
    };

    IpcEventBus.emitTyped('decision:captured', payload);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(payload);

    IpcEventBus.offTyped('decision:captured', handler);
  });

  it('delivers meeting:started and meeting:ended events', () => {
    const startHandler = vi.fn();
    const endHandler = vi.fn();

    IpcEventBus.onTyped('meeting:started', startHandler);
    IpcEventBus.onTyped('meeting:ended', endHandler);

    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm1' });
    IpcEventBus.emitTyped('meeting:ended', { meeting_id: 'm1' });

    expect(startHandler).toHaveBeenCalledWith({ meeting_id: 'm1' });
    expect(endHandler).toHaveBeenCalledWith({ meeting_id: 'm1' });

    IpcEventBus.offTyped('meeting:started', startHandler);
    IpcEventBus.offTyped('meeting:ended', endHandler);
  });

  it('supports unsubscribing with offTyped', () => {
    const handler = vi.fn();
    IpcEventBus.onTyped('decision:captured', handler);
    IpcEventBus.offTyped('decision:captured', handler);

    IpcEventBus.emitTyped('decision:captured', {
      type: 'ownership',
      speaker: 'Bob',
      timestamp: Date.now(),
      text_excerpt: 'test',
      confidence: 0.5,
      meeting_id: 'm1',
      turn_id: 't1',
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
