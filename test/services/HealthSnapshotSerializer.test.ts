import { describe, it, expect } from 'vitest';
import { serializeSnapshot, serializeError } from '../../electron/services/HealthSnapshotSerializer';

describe('HealthSnapshotSerializer', () => {
  it('serializes a degraded snapshot with alerts', () => {
    const md = serializeSnapshot({
      projectId: 'qualiaai',
      status: 'degraded',
      alerts: ['API timeout'],
      blockers: [],
      fetchedAt: '2026-04-21T09:55:00Z',
    });

    expect(md).toContain('# Qualiaai Health — 2026-04-21T09:55:00Z');
    expect(md).toContain('**Status:** degraded');
    expect(md).toContain('## Alerts');
    expect(md).toContain('- API timeout');
    expect(md).not.toContain('## Blockers');
  });

  it('serializes a healthy snapshot with no alerts or blockers', () => {
    const md = serializeSnapshot({
      projectId: 'finbiz',
      status: 'healthy',
      alerts: [],
      blockers: [],
      fetchedAt: '2026-04-21T10:00:00Z',
    });

    expect(md).toContain('# Finbiz Health — 2026-04-21T10:00:00Z');
    expect(md).toContain('**Status:** healthy');
    expect(md).not.toContain('## Alerts');
    expect(md).not.toContain('## Blockers');
  });

  it('serializes a snapshot with both alerts and blockers', () => {
    const md = serializeSnapshot({
      projectId: 'ev0',
      status: 'critical',
      alerts: ['High latency'],
      blockers: ['Deploy frozen'],
      fetchedAt: '2026-04-21T10:00:00Z',
    });

    expect(md).toContain('## Alerts');
    expect(md).toContain('- High latency');
    expect(md).toContain('## Blockers');
    expect(md).toContain('- Deploy frozen');
  });

  it('serializeError produces unavailable markdown', () => {
    const md = serializeError('qualiaai', 'Connection refused');

    expect(md).toContain('Qualiaai Health');
    expect(md).toContain('**Status:** unavailable');
    expect(md).toContain('Connection refused');
  });
});
