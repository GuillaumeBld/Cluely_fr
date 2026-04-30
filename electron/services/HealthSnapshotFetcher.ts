import { execFile } from 'child_process';
import { getEndpoint, HealthEndpoint } from '../config/HealthEndpointConfig';

export interface HealthSnapshot {
  projectId: string;
  status: string;
  alerts: string[];
  blockers: string[];
  fetchedAt: string; // ISO
  rawPayload?: unknown;
}

const HTTP_TIMEOUT_MS = 5_000;
const SCRIPT_TIMEOUT_MS = 10_000;

export class HealthSnapshotFetcher {
  async fetchForProject(projectId: string): Promise<HealthSnapshot | null> {
    const endpoint = getEndpoint(projectId);
    if (!endpoint) return null;

    try {
      return endpoint.type === 'http'
        ? await this.fetchHttp(projectId, endpoint.url)
        : await this.fetchScript(projectId, endpoint.path);
    } catch (err) {
      console.warn(`[HealthSnapshotFetcher] Failed for ${projectId}:`, err);
      return null;
    }
  }

  async fetchHttp(projectId: string, url: string): Promise<HealthSnapshot> {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      projectId,
      status: data.status ?? 'unknown',
      alerts: data.alerts ?? [],
      blockers: data.blockers ?? [],
      fetchedAt: new Date().toISOString(),
      rawPayload: data,
    };
  }

  async fetchScript(projectId: string, scriptPath: string): Promise<HealthSnapshot> {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(scriptPath, [], { timeout: SCRIPT_TIMEOUT_MS }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });
    const data = JSON.parse(stdout);
    return {
      projectId,
      status: data.status ?? 'unknown',
      alerts: data.alerts ?? [],
      blockers: data.blockers ?? [],
      fetchedAt: new Date().toISOString(),
      rawPayload: data,
    };
  }
}

export const healthSnapshotFetcher = new HealthSnapshotFetcher();
