import { describe, it, expect } from 'vitest';
import { MacroRunner } from '../../src/services/MacroRunner';
import {
  CrossSessionContextInjector,
  LedgerQueryService,
} from '../../src/services/CrossSessionContextInjector';
import type { DispatchMacro } from '../../electron/memory/schema';
import type { CommitmentRow } from '../../electron/memory/DecisionQuery';

function makeMacro(overrides?: Partial<DispatchMacro>): DispatchMacro {
  return {
    id: 1,
    project_id: 'finbiz',
    meeting_type: 'weekly-sync',
    template_id: 'code-task',
    prior_context_count: 3,
    dispatch_target: 'finbiz-archon',
    active: 1,
    created_at: '2026-04-20T10:00:00Z',
    ...overrides,
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

describe('MacroRunner', () => {
  it('returns MacroContext with templateId, priorDecisions, and dispatchTarget', () => {
    const rows: CommitmentRow[] = [
      { ...baseRow, edge_id: 1, meeting_id: 'meeting-1' },
      { ...baseRow, edge_id: 2, meeting_id: 'meeting-2' },
      { ...baseRow, edge_id: 3, meeting_id: 'meeting-3' },
    ];

    const ledger: LedgerQueryService = { getCommitments: () => rows };
    const injector = new CrossSessionContextInjector(ledger);
    const runner = new MacroRunner(injector);

    const ctx = runner.run(makeMacro(), 'meeting-4');

    expect(ctx.templateId).toBe('code-task');
    expect(ctx.dispatchTarget).toBe('finbiz-archon');
    expect(ctx.priorDecisions).toHaveLength(3);
    expect(ctx.injectedMeetingIds).toEqual(
      expect.arrayContaining(['meeting-1', 'meeting-2', 'meeting-3']),
    );
  });

  it('respects prior_context_count from macro', () => {
    const rows: CommitmentRow[] = Array.from({ length: 10 }, (_, i) => ({
      ...baseRow,
      edge_id: i + 1,
      meeting_id: `meeting-${i}`,
    }));

    const ledger: LedgerQueryService = { getCommitments: () => rows };
    const injector = new CrossSessionContextInjector(ledger);
    const runner = new MacroRunner(injector);

    const ctx = runner.run(makeMacro({ prior_context_count: 2 }), 'meeting-99');

    expect(ctx.priorDecisions).toHaveLength(2);
  });

  it('returns empty priorDecisions when no commitments exist', () => {
    const ledger: LedgerQueryService = { getCommitments: () => [] };
    const injector = new CrossSessionContextInjector(ledger);
    const runner = new MacroRunner(injector);

    const ctx = runner.run(makeMacro(), 'meeting-1');

    expect(ctx.priorDecisions).toHaveLength(0);
    expect(ctx.injectedMeetingIds).toHaveLength(0);
    expect(ctx.templateId).toBe('code-task');
  });
});
