import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindNodes = vi.fn();
const mockGetActiveProjectId = vi.fn().mockReturnValue('p1');
const mockGetActiveProjectLabel = vi.fn().mockReturnValue('Acme');
const mockSwitch = vi.fn();
const mockClearActive = vi.fn();

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../../electron/memory/MemoryManager', () => ({
  MemoryManager: {
    getInstance: () => ({ findNodes: mockFindNodes }),
  },
}));

vi.mock('../../electron/services/ProjectContextSwitcher', () => ({
  ProjectContextSwitcher: {
    getInstance: () => ({
      getActiveProjectId: mockGetActiveProjectId,
      getActiveProjectLabel: mockGetActiveProjectLabel,
      switch: mockSwitch,
      clearActive: mockClearActive,
    }),
  },
}));

import { registerContextHandlers } from '../../electron/ipc/contextHandlers';
import { ipcMain } from 'electron';

/** Pull a registered handler by channel name from ipcMain.handle mock calls. */
function getHandler(channel: string): (...args: any[]) => any {
  const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls;
  const entry = calls.find(([ch]: [string]) => ch === channel);
  if (!entry) throw new Error(`Handler for '${channel}' not registered`);
  return entry[1];
}

describe('registerContextHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerContextHandlers();
  });

  it('registers all four project IPC channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(([ch]: [string]) => ch);
    expect(channels).toContain('project:list');
    expect(channels).toContain('project:get-active');
    expect(channels).toContain('project:switch');
    expect(channels).toContain('project:clear');
  });

  describe('project:list', () => {
    it('delegates to MemoryManager.findNodes with the labelLike argument', async () => {
      mockFindNodes.mockResolvedValue([{ id: 'n1', label: 'Acme' }]);
      const handler = getHandler('project:list');
      const result = await handler({}, 'Ac');
      expect(mockFindNodes).toHaveBeenCalledWith('project', 'Ac');
      expect(result).toEqual([{ id: 'n1', label: 'Acme' }]);
    });

    it('returns [] when findNodes throws', async () => {
      mockFindNodes.mockRejectedValue(new Error('DB error'));
      const handler = getHandler('project:list');
      const result = await handler({});
      expect(result).toEqual([]);
    });
  });

  describe('project:get-active', () => {
    it('returns current active project id and label', () => {
      const handler = getHandler('project:get-active');
      const result = handler();
      expect(result).toEqual({ projectId: 'p1', label: 'Acme' });
    });

    it('returns null fields when getter throws', () => {
      mockGetActiveProjectId.mockImplementationOnce(() => { throw new Error('oops'); });
      const handler = getHandler('project:get-active');
      const result = handler();
      expect(result).toEqual({ projectId: null, label: null });
    });
  });

  describe('project:switch', () => {
    it('returns { success: true } on success', async () => {
      const handler = getHandler('project:switch');
      const result = await handler({}, 'p1', 'Acme');
      expect(mockSwitch).toHaveBeenCalledWith('p1', 'Acme');
      expect(result).toEqual({ success: true });
    });

    it('returns { success: false, error } when switcher throws', async () => {
      mockSwitch.mockImplementationOnce(() => { throw new Error('disk full'); });
      const handler = getHandler('project:switch');
      const result = await handler({}, 'p1', 'Acme');
      expect(result).toEqual({ success: false, error: 'disk full' });
    });
  });

  describe('project:clear', () => {
    it('returns { success: true } on success', () => {
      const handler = getHandler('project:clear');
      const result = handler();
      expect(mockClearActive).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('returns { success: false, error } when clearActive throws', () => {
      mockClearActive.mockImplementationOnce(() => { throw new Error('fs error'); });
      const handler = getHandler('project:clear');
      const result = handler();
      expect(result).toEqual({ success: false, error: 'fs error' });
    });
  });
});
