import { describe, it, expect, vi } from 'vitest';
import { HermesDrafter } from '../../electron/services/HermesDrafter';
import type { LLMHelper } from '../../electron/LLMHelper';

const mockLLM = {
  chat: vi.fn().mockResolvedValue(
    '{"title":"Address recurring blocker","templateId":"research-task","description":"Investigate recurring issue","steps":["Identify root cause","Propose fix","Schedule review"],"confidence":0.8}'
  ),
} as unknown as LLMHelper;

describe('HermesDrafter', () => {
  it('draftFromRecurringBlocker returns draft with source hermes-pattern', async () => {
    const drafter = new HermesDrafter(mockLLM);
    const draft = await drafter.draftFromRecurringBlocker({
      kind: 'recurring-blocker',
      label: 'auth-service',
      score: 0.8,
      occurrences: 4,
    });
    expect(draft).not.toBeNull();
    expect(draft!.source).toBe('hermes-pattern');
  });

  it('draftFromGoalDrift returns draft with source hermes-pattern', async () => {
    const drafter = new HermesDrafter(mockLLM);
    const draft = await drafter.draftFromGoalDrift({
      kind: 'goal-drift',
      label: 'Launch v2',
      score: 0.6,
      ageDays: 35,
    });
    expect(draft).not.toBeNull();
    expect(draft!.source).toBe('hermes-pattern');
  });

  it('draftFromContradiction returns draft with source hermes-pattern', async () => {
    const drafter = new HermesDrafter(mockLLM);
    const draft = await drafter.draftFromContradiction({
      kind: 'contradiction',
      label: 'pricing-model',
      score: 0.6,
      oldValue: 'flat fee',
      newValue: 'usage-based',
    });
    expect(draft).not.toBeNull();
    expect(draft!.source).toBe('hermes-pattern');
  });

  it('returns null when LLM returns invalid JSON', async () => {
    const badLLM = { chat: vi.fn().mockResolvedValue('not json at all') } as unknown as LLMHelper;
    const drafter = new HermesDrafter(badLLM);
    const draft = await drafter.draftFromRecurringBlocker({
      kind: 'recurring-blocker',
      label: 'x',
      score: 0.9,
      occurrences: 5,
    });
    expect(draft).toBeNull();
  });

  it('speaker is hermes-observer', async () => {
    const drafter = new HermesDrafter(mockLLM);
    const draft = await drafter.draftFromRecurringBlocker({
      kind: 'recurring-blocker',
      label: 'test',
      score: 0.7,
      occurrences: 3,
    });
    expect(draft!.speaker).toBe('hermes-observer');
  });
});
