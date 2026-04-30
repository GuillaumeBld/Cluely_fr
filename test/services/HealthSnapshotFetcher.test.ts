import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthSnapshotFetcher } from '../../electron/services/HealthSnapshotFetcher';

// Mock the config module
vi.mock('../../electron/config/HealthEndpointConfig', () => ({
  getEndpoint: vi.fn((id: string) => {
    if (id === 'httpproject') return { type: 'http', url: 'https://example.com/health' };
    if (id === 'scriptproject') return { type: 'script', path: '/usr/bin/health-check.sh' };
    return null;
  }),
}));

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('HealthSnapshotFetcher', () => {
  let fetcher: HealthSnapshotFetcher;

  beforeEach(() => {
    fetcher = new HealthSnapshotFetcher();
    vi.restoreAllMocks();
  });

  it('returns null for unknown project', async () => {
    const { getEndpoint } = await import('../../electron/config/HealthEndpointConfig');
    vi.mocked(getEndpoint).mockReturnValue(null);

    const result = await fetcher.fetchForProject('unknown');
    expect(result).toBeNull();
  });

  it('fetches HTTP endpoint and returns HealthSnapshot', async () => {
    const { getEndpoint } = await import('../../electron/config/HealthEndpointConfig');
    vi.mocked(getEndpoint).mockReturnValue({ type: 'http', url: 'https://example.com/health' });

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: 'degraded',
        alerts: ['API timeout on /v2/infer'],
        blockers: [],
      }),
    };
    global.fetch = vi.fn().mockResolvedValue(mockResponse) as any;

    const result = await fetcher.fetchForProject('httpproject');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('degraded');
    expect(result!.alerts).toEqual(['API timeout on /v2/infer']);
    expect(result!.blockers).toEqual([]);
    expect(result!.projectId).toBe('httpproject');
    expect(result!.fetchedAt).toBeTruthy();
  });

  it('fetches script endpoint and returns HealthSnapshot', async () => {
    const { getEndpoint } = await import('../../electron/config/HealthEndpointConfig');
    vi.mocked(getEndpoint).mockReturnValue({ type: 'script', path: '/usr/bin/health-check.sh' });

    const { execFile } = await import('child_process');
    vi.mocked(execFile).mockImplementation((_path: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify({ status: 'healthy', alerts: [], blockers: [] }), '');
      return {} as any;
    });

    const result = await fetcher.fetchForProject('scriptproject');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('healthy');
    expect(result!.projectId).toBe('scriptproject');
  });

  it('returns null when HTTP fetch throws (endpoint unreachable)', async () => {
    const { getEndpoint } = await import('../../electron/config/HealthEndpointConfig');
    vi.mocked(getEndpoint).mockReturnValue({ type: 'http', url: 'https://example.com/health' });

    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const result = await fetcher.fetchForProject('httpproject');
    expect(result).toBeNull();
  });

  it('returns null when HTTP response is not ok', async () => {
    const { getEndpoint } = await import('../../electron/config/HealthEndpointConfig');
    vi.mocked(getEndpoint).mockReturnValue({ type: 'http', url: 'https://example.com/health' });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;

    const result = await fetcher.fetchForProject('httpproject');
    expect(result).toBeNull();
  });

  it('returns null when script exec fails', async () => {
    const { getEndpoint } = await import('../../electron/config/HealthEndpointConfig');
    vi.mocked(getEndpoint).mockReturnValue({ type: 'script', path: '/usr/bin/health-check.sh' });

    const { execFile } = await import('child_process');
    vi.mocked(execFile).mockImplementation((_path: any, _args: any, _opts: any, cb: any) => {
      cb(new Error('exit code 1'), '', 'script failed');
      return {} as any;
    });

    const result = await fetcher.fetchForProject('scriptproject');
    expect(result).toBeNull();
  });
});
