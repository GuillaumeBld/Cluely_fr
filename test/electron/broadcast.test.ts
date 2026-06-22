import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', on: () => {}, whenReady: () => Promise.resolve() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: () => {}, on: () => {} },
  shell: {},
  nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
  Menu: { buildFromTemplate: () => ({}) },
  Tray: class {},
  desktopCapturer: { getSources: async () => [] },
}));

import { BrowserWindow } from 'electron';
import { broadcastToWindows } from '../../electron/main';

function makeMockWin(opts: { destroyed?: boolean; throws?: boolean; id?: number } = {}) {
  const send = opts.throws
    ? vi.fn(() => { throw new Error('renderer gone'); })
    : vi.fn();
  return {
    id: opts.id ?? 1,
    isDestroyed: vi.fn(() => opts.destroyed ?? false),
    webContents: { send },
  };
}

describe('broadcastToWindows()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends to all live windows', () => {
    const win1 = makeMockWin({ id: 1 });
    const win2 = makeMockWin({ id: 2 });
    (BrowserWindow.getAllWindows as any).mockReturnValue([win1, win2]);

    broadcastToWindows('test:event', { data: 42 });

    expect(win1.webContents.send).toHaveBeenCalledWith('test:event', { data: 42 });
    expect(win2.webContents.send).toHaveBeenCalledWith('test:event', { data: 42 });
  });

  it('skips destroyed windows', () => {
    const destroyed = makeMockWin({ destroyed: true, id: 1 });
    const alive = makeMockWin({ id: 2 });
    (BrowserWindow.getAllWindows as any).mockReturnValue([destroyed, alive]);

    broadcastToWindows('test:event');

    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(alive.webContents.send).toHaveBeenCalledWith('test:event');
  });

  it('continues broadcasting to remaining windows when one send() throws', () => {
    const bad = makeMockWin({ throws: true, id: 1 });
    const good = makeMockWin({ id: 2 });
    (BrowserWindow.getAllWindows as any).mockReturnValue([bad, good]);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => broadcastToWindows('approval:draft')).not.toThrow();
    expect(good.webContents.send).toHaveBeenCalledWith('approval:draft');
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[broadcast]'),
      expect.any(Error),
    );

    errSpy.mockRestore();
  });

  it('does nothing when no windows are open', () => {
    (BrowserWindow.getAllWindows as any).mockReturnValue([]);
    expect(() => broadcastToWindows('test:event')).not.toThrow();
  });
});
