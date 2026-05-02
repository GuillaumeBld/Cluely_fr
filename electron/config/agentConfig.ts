const DEFAULT_POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export interface AgentConfig {
  intervalMs: number;
}

let currentIntervalMs = DEFAULT_POLL_INTERVAL_MS;

export function getAgentConfig(): AgentConfig {
  return { intervalMs: currentIntervalMs };
}

export function setAgentIntervalMs(ms: number): void {
  currentIntervalMs = Math.max(60_000, ms); // minimum 1 minute
}

export const INTERVAL_PRESETS_MS = {
  '15min': 15 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '60min': 60 * 60 * 1000,
} as const;
