import { BrowserWindow } from 'electron';
import { getAllEndpoints } from '../config/HealthEndpointConfig';
import { healthSnapshotFetcher, HealthSnapshot } from './HealthSnapshotFetcher';
import { HealthChunkWriter } from './HealthChunkWriter';
import { serializeSnapshot, serializeError } from './HealthSnapshotSerializer';

export class DashboardPoller {
  private timer: NodeJS.Timeout | null = null;
  private _intervalMs: number;

  constructor(
    private healthChunkWriter: HealthChunkWriter,
    intervalMs = 5 * 60_000, // 5 min; health endpoints are low-frequency, not real-time
  ) {
    this._intervalMs = intervalMs;
  }

  start(intervalMs?: number): void {
    if (intervalMs !== undefined) this._intervalMs = intervalMs;
    this.stop();
    this.triggerCycle().catch(err => console.error('[DashboardPoller] Initial cycle failed:', err));
    this.timer = setInterval(() => this.triggerCycle().catch(err => console.error('[DashboardPoller] Cycle failed:', err)), this._intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setInterval(ms: number): void {
    this._intervalMs = ms;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  getIntervalMs(): number {
    return this._intervalMs;
  }

  /**
   * Runs one fetch cycle across all configured endpoints.
   * Prefixed with the intent of a semi-public API: called on demand from
   * dashboardHandlers and in tests, but not intended as a general-purpose
   * public method.
   */
  async triggerCycle(): Promise<void> {
    const endpoints = getAllEndpoints();
    const projectIds = Object.keys(endpoints);
    const now = new Date().toISOString();

    const results = await Promise.allSettled(
      projectIds.map(id => healthSnapshotFetcher.fetchForProject(id)),
    );

    const snapshots: Array<{ projectId: string; content: string; fetchedAt: string; stale: boolean }> = [];

    for (let i = 0; i < projectIds.length; i++) {
      const id = projectIds[i];
      const result = results[i];

      let content: string;
      let fetchedAt = now;

      if (result.status === 'fulfilled' && result.value) {
        const snapshot = result.value;
        fetchedAt = snapshot.fetchedAt;
        content = serializeSnapshot(snapshot);
      } else {
        const reason = result.status === 'rejected' ? String(result.reason) : 'no data';
        content = serializeError(id, reason);
      }

      try {
        this.healthChunkWriter.writeChunk(content, { projectId: id, fetchedAt });
      } catch (err) {
        console.warn(`[DashboardPoller] Failed to write chunk for ${id}:`, err);
      }

      const chunk = this.healthChunkWriter.getLatestChunk(id);
      if (chunk) {
        snapshots.push({
          projectId: chunk.projectId,
          content: chunk.content,
          fetchedAt: chunk.fetchedAt,
          stale: chunk.stale,
        });
      }
    }

    this.broadcast('dashboard:snapshots-updated', snapshots);
  }

  private broadcast(channel: string, data: unknown): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }
}
