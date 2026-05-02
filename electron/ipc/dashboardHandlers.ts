import { getAllEndpoints } from '../config/HealthEndpointConfig';
import { HealthChunkWriter } from '../services/HealthChunkWriter';
import { DashboardPoller } from '../services/DashboardPoller';

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
    } catch (err: any) {
      console.error('[dashboardHandlers] get-snapshots failed:', err);
      return { error: err.message };
    }
  });

  registrar.safeHandle('dashboard:refresh', async () => {
    if (!poller) return { success: false, error: 'Poller not initialized' };
    try {
      poller._runCycle().catch((err: any) => {
        console.error('[dashboardHandlers] refresh cycle failed:', err);
      });
      return { success: true };
    } catch (err: any) {
      console.error('[dashboardHandlers] refresh failed:', err);
      return { success: false, error: err.message };
    }
  });
}
