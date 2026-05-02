import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProactiveAdviceEngine } from '../../electron/services/ProactiveAdviceEngine';
import { LunrIndexer } from '../../electron/services/LunrIndexer';
import { IpcEventBus, DecisionCapturedEvent, ProactiveNudgePayload } from '../../electron/services/IpcEventBus';
import { LLMHelper } from '../../electron/LLMHelper';

const mockLLM = {
  chat: vi.fn().mockResolvedValue('{"message":"You haven\'t addressed their concern"}'),
} as unknown as LLMHelper;

const makeEvent = (overrides: Partial<DecisionCapturedEvent> = {}): DecisionCapturedEvent => ({
  type: 'commitment', speaker: 'Alice', timestamp: Date.now(),
  text_excerpt: "I'll handle it", confidence: 0.7,
  meeting_id: 'm1', turn_id: 't1', ...overrides,
});

describe('ProactiveAdviceEngine', () => {
  let indexer: LunrIndexer;
  let engine: ProactiveAdviceEngine;
  let captured: ProactiveNudgePayload[];
  let nudgeHandler: (p: ProactiveNudgePayload) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    indexer = new LunrIndexer();
    captured = [];
    nudgeHandler = (p) => captured.push(p);
    IpcEventBus.onTyped('proactive:nudge', nudgeHandler);
    engine = new ProactiveAdviceEngine(indexer, mockLLM);
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm1' });
  });

  afterEach(() => {
    engine.dispose();
    IpcEventBus.offTyped('proactive:nudge', nudgeHandler);
  });

  it('emits proactive:nudge on decision:captured when no throttle active', async () => {
    IpcEventBus.emitTyped('decision:captured', makeEvent());
    await vi.waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0].message).toBe("You haven't addressed their concern");
    expect(captured[0].meeting_id).toBe('m1');
  });

  it('throttles: second event within 2 min does not emit nudge', async () => {
    IpcEventBus.emitTyped('decision:captured', makeEvent({ turn_id: 't1' }));
    await vi.waitFor(() => expect(captured).toHaveLength(1));
    IpcEventBus.emitTyped('decision:captured', makeEvent({ turn_id: 't2' }));
    await new Promise(r => setTimeout(r, 50));
    expect(captured).toHaveLength(1); // still 1
  });

  it('resets throttle on meeting:started', async () => {
    IpcEventBus.emitTyped('decision:captured', makeEvent({ turn_id: 't1' }));
    await vi.waitFor(() => expect(captured).toHaveLength(1));
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm2' });
    IpcEventBus.emitTyped('decision:captured', makeEvent({ turn_id: 't2', meeting_id: 'm2' }));
    await vi.waitFor(() => expect(captured).toHaveLength(2));
  });

  it('does not emit when LLM returns null/invalid JSON', async () => {
    (mockLLM.chat as any).mockResolvedValueOnce('not json');
    IpcEventBus.emitTyped('decision:captured', makeEvent());
    await new Promise(r => setTimeout(r, 100));
    expect(captured).toHaveLength(0);
  });

  it('dispose() stops all listener subscriptions', async () => {
    engine.dispose();
    IpcEventBus.emitTyped('decision:captured', makeEvent());
    await new Promise(r => setTimeout(r, 50));
    expect(mockLLM.chat).not.toHaveBeenCalled();
  });
});
