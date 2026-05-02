import { describe, it, expect, vi } from 'vitest';
import { DailySummaryLLM, DailySummaryInput } from '../../electron/llm/DailySummaryLLM';
import type { LLMHelper } from '../../electron/LLMHelper';

function makeInput(overrides?: Partial<DailySummaryInput>): DailySummaryInput {
  return {
    date: '2026-05-02',
    meetings: [
      {
        title: 'Standup',
        overview: 'Quick sync on progress',
        actionItems: [{ text: 'Review PR', speaker: 'Alice' }],
        keyPoints: ['Backend ready'],
      },
    ],
    ...overrides,
  };
}

function makeMockLLMHelper(response: string) {
  return {
    streamChat: vi.fn().mockReturnValue(
      (async function* () {
        yield response;
      })()
    ),
  } as unknown as LLMHelper;
}

describe('DailySummaryLLM', () => {
  it('parses valid JSON response', async () => {
    const json = JSON.stringify({
      overview: 'Productive day',
      keyDecisions: ['Ship v2'],
      openActionItems: [{ text: 'Review PR', meetingTitle: 'Standup', speaker: 'Alice' }],
      themes: ['Releases'],
    });
    const helper = makeMockLLMHelper(json);
    const llm = new DailySummaryLLM(helper);

    const result = await llm.generate(makeInput());
    expect(result.overview).toBe('Productive day');
    expect(result.keyDecisions).toEqual(['Ship v2']);
    expect(result.openActionItems).toHaveLength(1);
    expect(result.themes).toEqual(['Releases']);
    expect(result.date).toBe('2026-05-02');
    expect(result.meetingsCount).toBe(1);
  });

  it('strips markdown JSON fences before parsing', async () => {
    const json = '```json\n{"overview":"Fenced","keyDecisions":[],"openActionItems":[],"themes":[]}\n```';
    const helper = makeMockLLMHelper(json);
    const llm = new DailySummaryLLM(helper);

    const result = await llm.generate(makeInput());
    expect(result.overview).toBe('Fenced');
  });

  it('returns fallback on malformed JSON', async () => {
    const helper = makeMockLLMHelper('not json at all {{{');
    const llm = new DailySummaryLLM(helper);

    const result = await llm.generate(makeInput());
    expect(result.overview).toBe('');
    expect(result.keyDecisions).toEqual([]);
    expect(result.date).toBe('2026-05-02');
  });

  it('handles empty meetings list', async () => {
    const json = JSON.stringify({
      overview: 'No meetings',
      keyDecisions: [],
      openActionItems: [],
      themes: [],
    });
    const helper = makeMockLLMHelper(json);
    const llm = new DailySummaryLLM(helper);

    const result = await llm.generate(makeInput({ meetings: [] }));
    expect(result.meetingsCount).toBe(0);
    expect(result.overview).toBe('No meetings');
  });

  it('handles LLM stream error gracefully', async () => {
    const helper = {
      streamChat: vi.fn().mockReturnValue(
        (async function* () {
          throw new Error('LLM unavailable');
        })()
      ),
    } as unknown as LLMHelper;

    const llm = new DailySummaryLLM(helper);
    const result = await llm.generate(makeInput());
    expect(result.overview).toBe('');
    expect(result.meetingsCount).toBe(1);
  });
});
