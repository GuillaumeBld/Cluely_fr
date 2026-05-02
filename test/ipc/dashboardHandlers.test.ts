/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../electron/config/HealthEndpointConfig', () => ({
  getAllEndpoints: vi.fn(() => ({
    'finbiz': { type: 'http', url: 'http://localhost:9101/health' },
  })),
}));

import { registerDashboardHandlers } from '../../electron/ipc/dashboardHandlers';
import { getAllEndpoints } from '../../electron/config/HealthEndpointConfig';

const mockGetAllEndpoints = getAllEndpoints as ReturnType<typeof vi.fn>;

function makeRegistrar() {
  const handlers: Record<string, (event: any, ...args: any[]) => any> = {};
  return {
    safeHandle: vi.fn((channel: string, listener: any) => {
      handlers[channel] = listener;
    }),
    invoke: (channel: string, ...args: any[]) => handlers[channel]?.({}, ...args),
  };
}

describe('registerDashboardHandlers', () => {
  beforeEach(() => {
    mockGetAllEndpoints.mockReturnValue({
      'finbiz': { type: 'http', url: 'http://localhost:9101/health' },
    });
  });

  describe('dashboard:get-snapshots', () => {
    it('returns [] when healthChunkWriter is null', async () => {
      const reg = makeRegistrar();
      registerDashboardHandlers(reg, null, null);

      const result = await reg.invoke('dashboard:get-snapshots');
      expect(result).toEqual([]);
    });

    it('returns snapshots for known project ids', async () => {
      const mockChunk = { projectId: 'finbiz', content: '# ok', fetchedAt: '2026-05-01T10:00:00Z', stale: false };
      const mockWriter = { getLatestChunk: vi.fn().mockReturnValue(mockChunk) } as any;
      const reg = makeRegistrar();
      registerDashboardHandlers(reg, mockWriter, null);

      const result = await reg.invoke('dashboard:get-snapshots');
      expect(result).toEqual([{ projectId: 'finbiz', content: '# ok', fetchedAt: '2026-05-01T10:00:00Z', stale: false }]);
    });

    it('returns [] (not {error}) when getAllEndpoints throws', async () => {
      mockGetAllEndpoints.mockImplementationOnce(() => { throw new Error('bad config'); });
      const mockWriter = { getLatestChunk: vi.fn() } as any;
      const reg = makeRegistrar();
      registerDashboardHandlers(reg, mockWriter, null);

      const result = await reg.invoke('dashboard:get-snapshots');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });
  });

  describe('dashboard:refresh', () => {
    it('returns { success: false } when poller is null', async () => {
      const reg = makeRegistrar();
      registerDashboardHandlers(reg, null, null);

      const result = await reg.invoke('dashboard:refresh');
      expect(result).toMatchObject({ success: false });
    });

    it('triggers triggerCycle and returns { success: true }', async () => {
      const mockPoller = { triggerCycle: vi.fn().mockResolvedValue(undefined) } as any;
      const reg = makeRegistrar();
      registerDashboardHandlers(reg, null, mockPoller);

      const result = await reg.invoke('dashboard:refresh');
      expect(mockPoller.triggerCycle).toHaveBeenCalled();
      expect(result).toMatchObject({ success: true });
    });
  });
});
