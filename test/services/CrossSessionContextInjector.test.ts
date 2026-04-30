import { describe, it, expect } from 'vitest';
import {
  CrossSessionContextInjector,
  LedgerQueryService,
} from '../../src/services/CrossSessionContextInjector';
import type { CommitmentRow } from '../../electron/memory/DecisionQuery';

function makeLedger(rows: CommitmentRow[]): LedgerQueryService {
  return {
    getCommitments: () => rows,
  };
}

const baseRow: CommitmentRow = {
  edge_id: 1,
  meeting_id: 'meeting-1',
  source_label: 'Alice',
  target_label: 'Bob',
  predicate: 'decided',
  weight: 0.9,
  created_at: '2026-04-20T10:00:00Z',
};

describe('CrossSessionContextInjector', () => {
  it('returns top-K decisions with provenance', () => {
    const rows: CommitmentRow[] = [
      { ...baseRow, edge_id: 1, meeting_id: 'meeting-1' },
      { ...baseRow, edge_id: 2, meeting_id: 'meeting-2', source_label: 'Bob', target_label: 'Charlie' },
      { ...baseRow, edge_id: 3, meeting_id: 'meeting-3', source_label: 'Charlie', target_label: 'Alice' },
      { ...baseRow, edge_id: 4, meeting_id: 'meeting-4', source_label: 'Dave', target_label: 'Eve' },
    ];

    const injector = new CrossSessionContextInjector(makeLedger(rows));
    const result = injector.inject('finbiz', 'weekly-sync', 3);

    expect(result.decisions).toHaveLength(3);
    expect(result.decisions[0]).toHaveProperty('text');
    expect(result.decisions[0]).toHaveProperty('speaker');
    expect(result.decisions[0]).toHaveProperty('timestamp');
    expect(result.decisions[0]).toHaveProperty('meeting_id');
  });

  it('includes injectedMeetingIds for provenance audit', () => {
    const rows: CommitmentRow[] = [
      { ...baseRow, edge_id: 1, meeting_id: 'meeting-1' },
      { ...baseRow, edge_id: 2, meeting_id: 'meeting-1' },
      { ...baseRow, edge_id: 3, meeting_id: 'meeting-2' },
    ];

    const injector = new CrossSessionContextInjector(makeLedger(rows));
    const result = injector.inject('finbiz', 'weekly-sync', 3);

    expect(result.injectedMeetingIds).toContain('meeting-1');
    expect(result.injectedMeetingIds).toContain('meeting-2');
    // Deduped — meeting-1 appears once
    expect(result.injectedMeetingIds).toHaveLength(2);
  });

  it('returns empty when no commitments exist', () => {
    const injector = new CrossSessionContextInjector(makeLedger([]));
    const result = injector.inject('finbiz', 'weekly-sync');

    expect(result.decisions).toHaveLength(0);
    expect(result.injectedMeetingIds).toHaveLength(0);
  });

  it('respects topK parameter', () => {
    const rows: CommitmentRow[] = Array.from({ length: 10 }, (_, i) => ({
      ...baseRow,
      edge_id: i + 1,
      meeting_id: `meeting-${i}`,
    }));

    const injector = new CrossSessionContextInjector(makeLedger(rows));
    const result = injector.inject('finbiz', 'weekly-sync', 5);

    expect(result.decisions).toHaveLength(5);
  });
});
