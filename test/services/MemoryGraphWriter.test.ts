import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IpcEventBus } from '../../electron/services/IpcEventBus';

// Mock DatabaseManager before importing MemoryGraphWriter
const mockGet = vi.fn();
const mockPrepare = vi.fn(() => ({ get: mockGet }));
const mockDb = { prepare: mockPrepare };

vi.mock('../../electron/db/DatabaseManager', () => ({
  DatabaseManager: {
    getInstance: () => ({
      getDb: () => mockDb,
    }),
  },
}));

import { MemoryGraphWriter } from '../../electron/services/MemoryGraphWriter';

describe('MemoryGraphWriter', () => {
  let writer: MemoryGraphWriter;

  beforeEach(() => {
    mockGet.mockReset();
    mockPrepare.mockClear();
    writer = new MemoryGraphWriter();
  });

  afterEach(() => {
    writer.destroy();
  });

  it('subscribes to decision:captured on construction', () => {
    const spy = vi.fn();
    const w = new MemoryGraphWriter();
    // Emit event — should not throw
    IpcEventBus.emitTyped('decision:captured', {
      type: 'action-item',
      speaker: 'Alice',
      text: 'will send report',
      confidence: 0.6,
    });
    w.destroy();
  });

  it('unsubscribes on destroy', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGet.mockReturnValue({ name: 'memory_nodes' });

    writer.destroy();

    // Emitting after destroy should not trigger any DB call
    mockPrepare.mockClear();
    IpcEventBus.emitTyped('decision:captured', {
      type: 'action-item',
      speaker: 'Bob',
      text: 'test',
      confidence: 0.5,
    });

    expect(mockPrepare).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('skips write when memory_nodes table does not exist', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGet.mockReturnValue(undefined);

    IpcEventBus.emitTyped('decision:captured', {
      type: 'action-item',
      speaker: 'Alice',
      text: 'do the thing',
      confidence: 0.7,
    });

    expect(mockPrepare).toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Queued low-confidence relation'),
    );
    consoleSpy.mockRestore();
  });

  it('logs queued relation when table exists', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGet.mockReturnValue({ name: 'memory_nodes' });

    IpcEventBus.emitTyped('decision:captured', {
      type: 'follow-up',
      speaker: 'Charlie',
      text: 'schedule sync',
      confidence: 0.8,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Queued low-confidence relation: follow-up by Charlie'),
    );
    consoleSpy.mockRestore();
  });

  it('handles DB unavailable gracefully', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockPrepare.mockImplementation(() => {
      throw new Error('DB locked');
    });

    IpcEventBus.emitTyped('decision:captured', {
      type: 'action-item',
      speaker: 'Dan',
      text: 'fix bug',
      confidence: 0.9,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('write skipped'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
