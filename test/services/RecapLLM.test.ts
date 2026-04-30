import { describe, it, expect, vi } from 'vitest';
import { extractActionItems, LLMClient } from '../../src/services/RecapLLM';

function mockLLMClient(response: string): LLMClient {
  return { chat: vi.fn().mockResolvedValue(response) };
}

describe('RecapLLM', () => {
  it('extracts action items from a transcript', async () => {
    const llm = mockLLMClient(JSON.stringify([
      { text: 'Write unit tests for the auth service', speaker: 'Alice', timestamp: '00:15', rawExcerpt: 'Alice: I\'ll write unit tests for the auth service' },
      { text: 'Review the database migration', speaker: 'Bob', timestamp: '00:22', rawExcerpt: 'Bob: I need to review the database migration' },
      { text: 'Send the project update email', speaker: 'Carol', timestamp: '00:30', rawExcerpt: 'Carol: I\'ll send the project update email' },
    ]));

    const items = await extractActionItems('some transcript with 3 action items', llm);

    expect(items).toHaveLength(3);
    expect(items[0].text).toBe('Write unit tests for the auth service');
    expect(items[0].speaker).toBe('Alice');
    expect(items[0].timestamp).toBe('00:15');
    expect(items[1].text).toBe('Review the database migration');
    expect(items[2].text).toBe('Send the project update email');
  });

  it('returns empty array for empty transcript without calling LLM', async () => {
    const llm = mockLLMClient('[]');
    const items = await extractActionItems('', llm);
    expect(items).toEqual([]);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only transcript', async () => {
    const llm = mockLLMClient('[]');
    const items = await extractActionItems('   \n  ', llm);
    expect(items).toEqual([]);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('returns empty array when LLM returns invalid JSON', async () => {
    const llm = mockLLMClient('Sorry, I cannot parse this transcript.');
    const items = await extractActionItems('some transcript', llm);
    expect(items).toEqual([]);
  });

  it('returns empty array when LLM returns truncated JSON', async () => {
    const llm = mockLLMClient('[{"text": "Do X", "speaker": "A"');
    const items = await extractActionItems('some transcript', llm);
    expect(items).toEqual([]);
  });

  it('handles LLM response wrapped in markdown fences', async () => {
    const llm = mockLLMClient('```json\n[{"text":"Do X","speaker":"A","timestamp":"01:00","rawExcerpt":"A said do X"}]\n```');
    const items = await extractActionItems('some transcript', llm);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Do X');
  });
});
