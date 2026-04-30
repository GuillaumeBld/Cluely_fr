import { readFileSync } from 'fs';
import { join } from 'path';

export interface HttpEndpoint {
  type: 'http';
  url: string;
}

export interface ScriptEndpoint {
  type: 'script';
  path: string;
}

export type HealthEndpoint = HttpEndpoint | ScriptEndpoint;

type EndpointMap = Record<string, HealthEndpoint>;

let cached: EndpointMap | null = null;

function loadEndpoints(): EndpointMap {
  if (cached) return cached;
  try {
    const raw = readFileSync(join(__dirname, 'projectHealthEndpoints.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: EndpointMap = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (isHealthEndpoint(entry)) {
        result[id] = entry;
      }
    }
    cached = result;
    return result;
  } catch {
    cached = {};
    return {};
  }
}

function isHealthEndpoint(v: unknown): v is HealthEndpoint {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.type === 'http' && typeof obj.url === 'string') return true;
  if (obj.type === 'script' && typeof obj.path === 'string') return true;
  return false;
}

export function getEndpoint(projectId: string): HealthEndpoint | null {
  return loadEndpoints()[projectId] ?? null;
}

export function getAllEndpoints(): EndpointMap {
  return { ...loadEndpoints() };
}

/** Reset cache (for testing) */
export function resetCache(): void {
  cached = null;
}
