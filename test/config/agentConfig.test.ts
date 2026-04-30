import { describe, it, expect, beforeEach } from 'vitest';
import { getAgentConfig, setAgentIntervalMs } from '../../electron/config/agentConfig';

describe('agentConfig', () => {
  beforeEach(() => {
    // Reset to default
    setAgentIntervalMs(30 * 60 * 1000);
  });

  it('returns default 30-minute interval', () => {
    expect(getAgentConfig().intervalMs).toBe(30 * 60 * 1000);
  });

  it('updates interval with setAgentIntervalMs', () => {
    setAgentIntervalMs(5 * 60 * 1000);
    expect(getAgentConfig().intervalMs).toBe(5 * 60 * 1000);
  });

  it('enforces 60-second minimum floor', () => {
    setAgentIntervalMs(1000);
    expect(getAgentConfig().intervalMs).toBe(60_000);
  });

  it('clamps zero to 60 seconds', () => {
    setAgentIntervalMs(0);
    expect(getAgentConfig().intervalMs).toBe(60_000);
  });

  it('clamps negative values to 60 seconds', () => {
    setAgentIntervalMs(-5000);
    expect(getAgentConfig().intervalMs).toBe(60_000);
  });

  it('allows values above minimum', () => {
    setAgentIntervalMs(120_000);
    expect(getAgentConfig().intervalMs).toBe(120_000);
  });
});
