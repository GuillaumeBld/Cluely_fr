import type { ActionItem } from '../types/workflows';

export interface LLMClient {
  chat(prompt: string): Promise<string>;
}

const EXTRACTION_PROMPT = `Extract all action items from the following meeting transcript.
For each action item, return a JSON object with:
- text: the action item as an imperative sentence
- speaker: who is responsible
- timestamp: the approximate time in HH:MM format
- rawExcerpt: the verbatim quote from the transcript

Return a JSON array of action items. If there are no action items, return an empty array [].
Only return valid JSON, no markdown fences or extra text.

TRANSCRIPT:
`;

export async function extractActionItems(
  transcript: string,
  llmClient: LLMClient,
): Promise<ActionItem[]> {
  if (!transcript.trim()) {
    return [];
  }

  const response = await llmClient.chat(EXTRACTION_PROMPT + transcript);

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed: unknown = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item: Record<string, unknown>) => ({
    text: String(item.text ?? ''),
    speaker: String(item.speaker ?? ''),
    timestamp: String(item.timestamp ?? ''),
    rawExcerpt: String(item.rawExcerpt ?? ''),
  }));
}
