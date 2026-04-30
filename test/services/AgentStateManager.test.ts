import { describe, it, expect, afterEach } from 'vitest';
import { AgentStateManager } from '../../electron/services/AgentStateManager';
import { IpcEventBus } from '../../electron/services/IpcEventBus';

describe('AgentStateManager', () => {
  let manager: AgentStateManager;

  afterEach(() => {
    manager?.dispose();
  });

  it('starts unpaused', () => {
    manager = new AgentStateManager();
    expect(manager.isPaused()).toBe(false);
  });

  it('pauses when meeting:started is emitted', () => {
    manager = new AgentStateManager();
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm1' });
    expect(manager.isPaused()).toBe(true);
  });

  it('resumes when meeting:ended is emitted after meeting:started', () => {
    manager = new AgentStateManager();
    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm1' });
    expect(manager.isPaused()).toBe(true);

    IpcEventBus.emitTyped('meeting:ended', { meeting_id: 'm1' });
    expect(manager.isPaused()).toBe(false);
  });

  it('dispose removes listeners', () => {
    manager = new AgentStateManager();
    manager.dispose();

    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'm1' });
    expect(manager.isPaused()).toBe(false);
  });
});
