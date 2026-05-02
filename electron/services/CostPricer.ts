/**
 * Static pricing table and cost estimation for LLM providers.
 * Pure functions — no electron or IPC dependencies.
 */

// TODO: update pricing — these are approximate 2026 values
export const PROVIDER_PRICING: Record<string, { inputCentsPerMToken: number; outputCentsPerMToken: number }> = {
  'gemini:gemini-3-flash-preview': { inputCentsPerMToken: 7.5, outputCentsPerMToken: 30 },
  'gemini:gemini-3-pro-preview': { inputCentsPerMToken: 125, outputCentsPerMToken: 500 },
  'groq:llama-3.3-70b-versatile': { inputCentsPerMToken: 59, outputCentsPerMToken: 79 },
  'openai:gpt-5.2-chat-latest': { inputCentsPerMToken: 250, outputCentsPerMToken: 1000 },
  'claude:claude-sonnet-4-5': { inputCentsPerMToken: 300, outputCentsPerMToken: 1500 },
};

export function estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const key = `${provider}:${model}`;
  const pricing = PROVIDER_PRICING[key];
  if (!pricing) {
    console.warn('[CostPricer] Unknown model for pricing:', provider, model);
    return 0;
  }
  return (inputTokens * pricing.inputCentsPerMToken + outputTokens * pricing.outputCentsPerMToken) / 1_000_000;
}
