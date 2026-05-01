import { describe, it, expect } from 'vitest';
import { RecapLLM } from '../../electron/llm/RecapLLM';
import { ConflictResolution } from '../../electron/memory/schema';

describe('RecapLLM — appendConflictDigest', () => {
  // Create a minimal instance (LLMHelper not needed for digest method)
  const recap = new RecapLLM(null as any);

  it('appends empty section when no conflicts resolved', () => {
    const result = recap.appendConflictDigest('Summary here.', []);
    expect(result).toContain('## Memory Conflicts Resolved');
    expect(result).toContain('No memory conflicts detected.');
    expect(result).toMatch(/^Summary here\./);
  });

  it('appends resolved conflicts with action labels', () => {
    const resolutions: ConflictResolution[] = [
      {
        id: 1,
        conflict_id: null,
        node_id: 'n1',
        fact_key: 'role',
        old_value: 'backend dev',
        new_value: 'API lead',
        action: 'update',
        meeting_id: 'm1',
        resolved_at: '2026-04-22 10:00:00',
      },
      {
        id: 2,
        conflict_id: null,
        node_id: 'n2',
        fact_key: 'team',
        old_value: 'infra',
        new_value: 'platform',
        action: 'flag',
        meeting_id: 'm1',
        resolved_at: '2026-04-22 10:01:00',
      },
    ];

    const result = recap.appendConflictDigest('Summary.', resolutions);
    expect(result).toContain('## Memory Conflicts Resolved');
    expect(result).toContain('**role**: "backend dev" → "API lead" (Updated)');
    expect(result).toContain('**team**: "infra" → "platform" (Flagged)');
  });

  it('labels ignored resolutions correctly', () => {
    const resolutions: ConflictResolution[] = [
      {
        id: 1,
        conflict_id: null,
        node_id: 'n1',
        fact_key: 'location',
        old_value: 'Paris',
        new_value: 'London',
        action: 'ignore',
        meeting_id: 'm1',
        resolved_at: '2026-04-22 10:00:00',
      },
    ];

    const result = recap.appendConflictDigest('Summary.', resolutions);
    expect(result).toContain('(Ignored)');
  });
});
