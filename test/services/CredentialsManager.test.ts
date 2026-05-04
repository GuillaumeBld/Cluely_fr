import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CredentialsManager, DEFAULT_HERMES_CONFIG } from '../../electron/services/CredentialsManager';

// CredentialsManager uses safeStorage and fs — mock them so tests run without Electron
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  safeStorage: { isEncryptionAvailable: () => false },
}));
vi.mock('fs', () => ({
  default: {
    existsSync: () => false,
    readFileSync: () => '',
    writeFileSync: () => undefined,
  },
}));

describe('CredentialsManager — HermesObserver config', () => {
  let mgr: CredentialsManager;

  beforeEach(() => {
    // Reset singleton for isolation between tests
    (CredentialsManager as any).instance = null;
    mgr = CredentialsManager.getInstance();
  });

  it('getHermesObserverConfig returns DEFAULT_HERMES_CONFIG when not set', () => {
    const cfg = mgr.getHermesObserverConfig();
    expect(cfg.enabled).toBe(DEFAULT_HERMES_CONFIG.enabled);
    expect(cfg.intervalMs).toBe(DEFAULT_HERMES_CONFIG.intervalMs);
    expect(cfg.sensitivity).toBe(DEFAULT_HERMES_CONFIG.sensitivity);
  });

  it('setHermesObserverEnabled persists enabled=false', () => {
    mgr.setHermesObserverEnabled(false);
    expect(mgr.getHermesObserverConfig().enabled).toBe(false);
  });

  it('setHermesObserverEnabled persists enabled=true', () => {
    mgr.setHermesObserverEnabled(false);
    mgr.setHermesObserverEnabled(true);
    expect(mgr.getHermesObserverConfig().enabled).toBe(true);
  });

  it('setHermesObserverIntervalMs persists a valid value', () => {
    mgr.setHermesObserverIntervalMs(3_600_000);
    expect(mgr.getHermesObserverConfig().intervalMs).toBe(3_600_000);
  });

  it('setHermesObserverIntervalMs clamps 0 to the 1-minute floor', () => {
    mgr.setHermesObserverIntervalMs(0);
    expect(mgr.getHermesObserverConfig().intervalMs).toBe(60_000);
  });

  it('setHermesObserverIntervalMs clamps negative values to the 1-minute floor', () => {
    mgr.setHermesObserverIntervalMs(-1000);
    expect(mgr.getHermesObserverConfig().intervalMs).toBe(60_000);
  });

  it('setHermesObserverSensitivity persists a valid value', () => {
    mgr.setHermesObserverSensitivity(0.8);
    expect(mgr.getHermesObserverConfig().sensitivity).toBe(0.8);
  });

  it('setHermesObserverSensitivity clamps values below 0 to 0', () => {
    mgr.setHermesObserverSensitivity(-0.5);
    expect(mgr.getHermesObserverConfig().sensitivity).toBe(0);
  });

  it('setHermesObserverSensitivity clamps values above 1 to 1', () => {
    mgr.setHermesObserverSensitivity(2.0);
    expect(mgr.getHermesObserverConfig().sensitivity).toBe(1);
  });

  it('setHermesObserverSensitivity preserves other config fields', () => {
    mgr.setHermesObserverEnabled(false);
    mgr.setHermesObserverSensitivity(0.8);
    const cfg = mgr.getHermesObserverConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.sensitivity).toBe(0.8);
  });
});
