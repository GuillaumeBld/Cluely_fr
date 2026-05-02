import { describe, it, expect, vi } from 'vitest';
import { BackgroundTriggerDrafter } from '../../electron/services/BackgroundTriggerDrafter';
import type { LLMHelper } from '../../electron/LLMHelper';

const mockLLM = {
  chat: vi.fn().mockResolvedValue(
    '{"title":"Follow up","templateId":"follow-up-email","description":"Send follow-up","steps":["Draft email","Send"],"confidence":0.85}'
  ),
} as unknown as LLMHelper;

describe('BackgroundTriggerDrafter', () => {
  it('drafts from email trigger with correct source', async () => {
    const drafter = new BackgroundTriggerDrafter(mockLLM);
    const draft = await drafter.draftFromEmail({
      subject: 'Q2 Planning',
      sender: 'alice@example.com',
      date: new Date().toISOString(),
      snippet: 'Let me know your thoughts',
      mailbox: 'INBOX',
    });
    expect(draft).not.toBeNull();
    expect(draft!.source).toBe('background-email');
    expect(draft!.templateId).toBe('follow-up-email');
    expect(draft!.speaker).toBe('background-agent');
  });

  it('returns null when LLM returns invalid JSON', async () => {
    const badLLM = { chat: vi.fn().mockResolvedValue('not json') } as unknown as LLMHelper;
    const drafter = new BackgroundTriggerDrafter(badLLM);
    const draft = await drafter.draftFromEmail({
      subject: 'X', sender: 'x@x.com', date: new Date().toISOString(), snippet: '', mailbox: 'INBOX',
    });
    expect(draft).toBeNull();
  });

  it('drafts from staleness trigger with correct source', async () => {
    const drafter = new BackgroundTriggerDrafter(mockLLM);
    const draft = await drafter.draftFromStaleness({
      id: 'c1', meetingId: 'm1', text: "I'll send report", speaker: 'Bob',
      timestamp: Date.now() - 86400000, dispatchedJobId: null,
    });
    expect(draft!.source).toBe('background-staleness');
  });
});
