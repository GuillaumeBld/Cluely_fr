import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getWsConfig, setWsPort } from '../../electron/config/wsConfig';

describe('wsConfig', () => {
  beforeEach(() => {
    // Reset to default port between tests
    setWsPort(8765);
  });

  it('returns default port 8765', () => {
    expect(getWsConfig().port).toBe(8765);
  });

  it('updates port with setWsPort', () => {
    setWsPort(9000);
    expect(getWsConfig().port).toBe(9000);
  });

  it('accepts lower boundary port 1024', () => {
    setWsPort(1024);
    expect(getWsConfig().port).toBe(1024);
  });

  it('accepts upper boundary port 65535', () => {
    setWsPort(65535);
    expect(getWsConfig().port).toBe(65535);
  });

  it('rejects port 1023 (below minimum) and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = getWsConfig().port;
    setWsPort(1023);
    expect(getWsConfig().port).toBe(before);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid port 1023'));
    warnSpy.mockRestore();
  });

  it('rejects port 65536 (above maximum) and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = getWsConfig().port;
    setWsPort(65536);
    expect(getWsConfig().port).toBe(before);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid port 65536'));
    warnSpy.mockRestore();
  });

  it('rejects port 0 and does not update config', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = getWsConfig().port;
    setWsPort(0);
    expect(getWsConfig().port).toBe(before);
    warnSpy.mockRestore();
  });
});
