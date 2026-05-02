import { describe, it, expect } from 'vitest';
import type { NodeKind, EdgePredicate } from '../../electron/memory/schema';

describe('schema types', () => {
  it('NodeKind includes commitment', () => {
    const kind: NodeKind = 'commitment';
    expect(kind).toBe('commitment');
  });

  it('NodeKind includes all expected values', () => {
    const kinds: NodeKind[] = ['person', 'topic', 'organization', 'project', 'meeting', 'decision', 'goal', 'commitment'];
    expect(kinds).toHaveLength(8);
  });

  it('EdgePredicate includes new predicates', () => {
    const predicates: EdgePredicate[] = ['reports_to', 'blocked_by', 'contradicts', 'prefers'];
    expect(predicates).toHaveLength(4);
  });

  it('EdgePredicate includes all expected values', () => {
    const predicates: EdgePredicate[] = [
      'knows', 'works_on', 'belongs_to', 'agreed_with', 'owes',
      'discussed', 'decided', 'reports_to', 'blocked_by', 'contradicts', 'prefers',
    ];
    expect(predicates).toHaveLength(11);
  });
});
