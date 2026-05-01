import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEndpoint, resetCache } from '../../electron/config/HealthEndpointConfig';

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({
    qualiaai: { type: 'script', path: './scripts/qualiaai-health.sh' },
    finbiz: { type: 'http', url: 'https://status.finbiz.internal/api/health' },
    bad: { type: 'invalid' },
  })),
}));

describe('HealthEndpointConfig', () => {
  beforeEach(() => {
    resetCache();
  });

  it('returns script endpoint for qualiaai', () => {
    const ep = getEndpoint('qualiaai');
    expect(ep).toEqual({ type: 'script', path: './scripts/qualiaai-health.sh' });
  });

  it('returns http endpoint for finbiz', () => {
    const ep = getEndpoint('finbiz');
    expect(ep).toEqual({ type: 'http', url: 'https://status.finbiz.internal/api/health' });
  });

  it('returns null for unknown project', () => {
    expect(getEndpoint('unknown')).toBeNull();
  });

  it('skips invalid entries', () => {
    expect(getEndpoint('bad')).toBeNull();
  });
});
