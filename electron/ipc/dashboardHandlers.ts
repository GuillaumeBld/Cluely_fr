import { getAllEndpoints } from '../config/HealthEndpointConfig';
import { HealthChunkWriter } from '../services/HealthChunkWriter';
import { DashboardPoller } from '../services/DashboardPoller';

// Structural type matching ipcHandlers.ts's `safeHandle` closure.
// Defined locally to avoid a circular import between ipc/ and the root electron/ layer.
// If the safeHandle signature changes upstream, update both.
type SafeHandleRegistrar = {
  safeHandle(channel: string, listener: (event: any, ...args: any[]) => Promise<any> | any): void;
};

export function registerDashboardHandlers(
  registrar: SafeHandleRegistrar,
  healthChunkWriter: HealthChunkWriter | null,
  poller: DashboardPoller | null,
): void {
  registrar.safeHandle('dashboard:get-snapshots', async () => {
    if (!healthChunkWriter) return [];
    try {
      const endpoints = getAllEndpoints();
      const projectIds = Object.keys(endpoints);
      const snapshots: Array<{ projectId: string; content: string; fetchedAt: string; stale: boolean }> = [];

      for (const id of projectIds) {
        const chunk = healthChunkWriter.getLatestChunk(id);
        if (chunk) {
          snapshots.push({
            projectId: chunk.projectId,
            content: chunk.content,
            fetchedAt: chunk.fetchedAt,
            stale: chunk.stale,
          });
        }
      }

      return snapshots;
    } catch (err: unknown) {
      console.error('[dashboardHandlers] get-snapshots failed:', err);
      return [];
    }
  });

  registrar.safeHandle('dashboard:refresh', async () => {
    if (!poller) return { success: false, error: 'Poller not initialized' };
    // Fire-and-forget: `success: true` means the cycle was enqueued, not completed.
    // Async errors from triggerCycle() are caught by the inner .catch(). The outer
    // try/catch guards against any unexpected synchronous throw before the promise resolves.
    try {
      poller.triggerCycle().catch((err: any) => {
        console.error('[dashboardHandlers] refresh cycle failed:', err);
      });
      return { success: true };
    } catch (err: any) {
      console.error('[dashboardHandlers] refresh failed:', err);
      return { success: false, error: err.message };
    }
  });
}
