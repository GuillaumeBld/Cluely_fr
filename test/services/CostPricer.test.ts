import { describe, it, expect, vi } from 'vitest';
import { estimateCost, PROVIDER_PRICING } from '../../electron/services/CostPricer';

describe('CostPricer', () => {
  it('calculates correct cost for known model (gemini flash)', () => {
    // 1000 input tokens * 7.5 / 1M + 500 output tokens * 30 / 1M
    const cost = estimateCost('gemini', 'gemini-3-flash-preview', 1000, 500);
    expect(cost).toBeCloseTo((1000 * 7.5 + 500 * 30) / 1_000_000);
  });

  it('calculates correct cost for claude', () => {
    const cost = estimateCost('claude', 'claude-sonnet-4-5', 1000, 1000);
    expect(cost).toBeCloseTo((1000 * 300 + 1000 * 1500) / 1_000_000);
  });

  it('returns 0 for unknown model and does not throw', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cost = estimateCost('unknown', 'nonexistent-model', 1000, 500);
    expect(cost).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith('[CostPricer] Unknown model for pricing:', 'unknown', 'nonexistent-model');
    warnSpy.mockRestore();
  });

  it('returns 0 for zero tokens', () => {
    const cost = estimateCost('gemini', 'gemini-3-flash-preview', 0, 0);
    expect(cost).toBe(0);
  });

  it('has pricing entries for all expected providers', () => {
    expect(PROVIDER_PRICING['gemini:gemini-3-flash-preview']).toBeDefined();
    expect(PROVIDER_PRICING['gemini:gemini-3-pro-preview']).toBeDefined();
    expect(PROVIDER_PRICING['groq:llama-3.3-70b-versatile']).toBeDefined();
    expect(PROVIDER_PRICING['openai:gpt-5.2-chat-latest']).toBeDefined();
    expect(PROVIDER_PRICING['claude:claude-sonnet-4-5']).toBeDefined();
  });
});
