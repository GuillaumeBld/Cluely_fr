import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HermesObserver } from '../../electron/services/HermesObserver';
import { AgentStateManager } from '../../electron/services/AgentStateManager';
import { IpcEventBus } from '../../electron/services/IpcEventBus';
import { BrowserWindow } from 'electron';
import type { HermesDrafter, HermesPattern } from '../../electron/services/HermesDrafter';

const mockSend = vi.fn();
vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([
  { isDestroyed: () => false, webContents: { send: mockSend } } as any,
]);

function createMockDrafter(): HermesDrafter {
  return {
    draftFromRecurringBlocker: vi.fn().mockResolvedValue({
      id: 'draft-1',
      templateId: 'research-task',
      payload: { title: 'Recurring blocker', description: 'Test', steps: ['step1'] },
      kbCitations: [],
      goalTag: null,
      speaker: 'hermes-observer',
      confidence: 0.8,
      source: 'hermes-pattern',
      tokensUsed: 700,
    }),
    draftFromGoalDrift: vi.fn().mockResolvedValue({
      id: 'draft-2',
      templateId: 'research-task',
      payload: { title: 'Goal drift', description: 'Test', steps: ['step1'] },
      kbCitations: [],
      goalTag: null,
      speaker: 'hermes-observer',
      confidence: 0.7,
      source: 'hermes-pattern',
      tokensUsed: 700,
    }),
    draftFromContradiction: vi.fn().mockResolvedValue({
      id: 'draft-3',
      templateId: 'research-task',
      payload: { title: 'Contradiction', description: 'Test', steps: ['step1'] },
      kbCitations: [],
      goalTag: null,
      speaker: 'hermes-observer',
      confidence: 0.6,
      source: 'hermes-pattern',
      tokensUsed: 700,
    }),
  } as unknown as HermesDrafter;
}

describe('HermesObserver', () => {
  let stateManager: AgentStateManager;
  let observer: HermesObserver;
  let drafter: HermesDrafter;

  beforeEach(() => {
    mockSend.mockClear();
    stateManager = new AgentStateManager();
    drafter = createMockDrafter();
    observer = new HermesObserver(stateManager, 60000, drafter);
  });

  afterEach(() => {
    observer.stop();
    stateManager.dispose();
  });

  it('skips cycle when disabled', async () => {
    observer.setEnabled(false);
    vi.spyOn(observer as any, '_detectPatterns').mockReturnValue([
      { kind: 'recurring-blocker', label: 'auth-service', score: 0.8, occurrences: 4 },
    ]);
    await observer._runCycle();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('skips cycle when paused (meeting active)', async () => {
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'test-meeting' });
    vi.spyOn(observer as any, '_detectPatterns').mockReturnValue([
      { kind: 'recurring-blocker', label: 'auth-service', score: 0.8, occurrences: 4 },
    ]);
    await observer._runCycle();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('broadcasts approval:drafts-ready when drafter produces draft for recurring blocker', async () => {
    vi.spyOn(observer as any, '_detectPatterns').mockReturnValue([
      { kind: 'recurring-blocker', label: 'auth-service', score: 0.8, occurrences: 4 },
    ]);
    await observer._runCycle();
    expect(mockSend).toHaveBeenCalledWith('approval:drafts-ready', expect.objectContaining({
      drafts: expect.arrayContaining([expect.objectContaining({ source: 'hermes-pattern' })]),
    }));
  });

  it('sensitivity gate: skips patterns below threshold', async () => {
    observer.setSensitivity(0.5);
    vi.spyOn(observer as any, '_detectPatterns').mockReturnValue([
      { kind: 'recurring-blocker', label: 'low-score', score: 0.3, occurrences: 1 },
    ]);
    await observer._runCycle();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sensitivity gate: surfaces patterns at or above threshold', async () => {
    observer.setSensitivity(0.5);
    vi.spyOn(observer as any, '_detectPatterns').mockReturnValue([
      { kind: 'recurring-blocker', label: 'auth-service', score: 0.5, occurrences: 3 },
    ]);
    await observer._runCycle();
    expect(mockSend).toHaveBeenCalledWith('approval:drafts-ready', expect.anything());
  });

  it('swallows errors in _runCycle and does not throw', async () => {
    const throwingDrafter = {
      draftFromRecurringBlocker: vi.fn().mockRejectedValue(new Error('LLM down')),
      draftFromGoalDrift: vi.fn(),
      draftFromContradiction: vi.fn(),
    } as unknown as HermesDrafter;
    const obs = new HermesObserver(stateManager, 60000, throwingDrafter);
    vi.spyOn(obs as any, '_detectPatterns').mockReturnValue([
      { kind: 'recurring-blocker', label: 'x', score: 0.9, occurrences: 5 },
    ]);
    // Should not throw
    await expect(obs._runCycle()).resolves.toBeUndefined();
    obs.stop();
  });

  it('setInterval/getIntervalMs round-trip', () => {
    observer.start(30000);
    observer.setInterval(120000);
    expect(observer.getIntervalMs()).toBe(120000);
  });

  it('stop() clears timer', () => {
    observer.start();
    expect((observer as any).timer).not.toBeNull();
    observer.stop();
    expect((observer as any).timer).toBeNull();
  });
});
