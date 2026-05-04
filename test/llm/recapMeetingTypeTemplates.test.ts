import { describe, it, expect, vi } from 'vitest';
import { RecapLLM } from '../../electron/llm/RecapLLM';
import {
  STANDUP_RECAP_PROMPT,
  SALES_RECAP_PROMPT,
  INTERVIEW_RECAP_PROMPT,
  ONE_ON_ONE_RECAP_PROMPT,
  UNIVERSAL_RECAP_PROMPT,
} from '../../electron/llm/prompts';

function mockHelper() {
  async function* gen() { yield 'ok'; }
  return { streamChat: vi.fn().mockImplementation(() => gen()) };
}

async function drainStream(gen: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

describe('RecapLLM — meeting type prompt selection', () => {
  it('uses STANDUP_RECAP_PROMPT for standup', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    await recap.generate('context', 'standup');
    expect(helper.streamChat).toHaveBeenCalledWith(
      'context', undefined, undefined, STANDUP_RECAP_PROMPT
    );
  });

  it('uses UNIVERSAL_RECAP_PROMPT for general (default)', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    await recap.generate('context');
    expect(helper.streamChat).toHaveBeenCalledWith(
      'context', undefined, undefined, UNIVERSAL_RECAP_PROMPT
    );
  });

  it('uses SALES_RECAP_PROMPT for sales', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    await recap.generate('context', 'sales');
    expect(helper.streamChat).toHaveBeenCalledWith(
      'context', undefined, undefined, SALES_RECAP_PROMPT
    );
  });

  it('uses ONE_ON_ONE_RECAP_PROMPT for one_on_one', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    await recap.generate('context', 'one_on_one');
    expect(helper.streamChat).toHaveBeenCalledWith(
      'context', undefined, undefined, ONE_ON_ONE_RECAP_PROMPT
    );
  });

  it('uses INTERVIEW_RECAP_PROMPT for interview', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    await recap.generate('context', 'interview');
    expect(helper.streamChat).toHaveBeenCalledWith(
      'context', undefined, undefined, INTERVIEW_RECAP_PROMPT
    );
  });
});

describe('RecapLLM — generateStream prompt selection', () => {
  it('uses STANDUP_RECAP_PROMPT for standup (stream)', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    await drainStream(recap.generateStream('context', 'standup'));
    expect(helper.streamChat).toHaveBeenCalledWith(
      'context', undefined, undefined, STANDUP_RECAP_PROMPT
    );
  });

  it('uses UNIVERSAL_RECAP_PROMPT for general (stream)', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    await drainStream(recap.generateStream('context', 'general'));
    expect(helper.streamChat).toHaveBeenCalledWith(
      'context', undefined, undefined, UNIVERSAL_RECAP_PROMPT
    );
  });

  it('uses UNIVERSAL_RECAP_PROMPT as default when meetingType omitted (stream)', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    await drainStream(recap.generateStream('context'));
    expect(helper.streamChat).toHaveBeenCalledWith(
      'context', undefined, undefined, UNIVERSAL_RECAP_PROMPT
    );
  });

  it('returns nothing for empty context (stream)', async () => {
    const helper = mockHelper();
    const recap = new RecapLLM(helper as any);
    const chunks = await drainStream(recap.generateStream('   '));
    expect(chunks).toHaveLength(0);
    expect(helper.streamChat).not.toHaveBeenCalled();
  });

  it('propagates error when streamChat throws', async () => {
    async function* throwing() { throw new Error('LLM down'); yield 'never'; }
    const helper = { streamChat: vi.fn().mockImplementation(() => throwing()) };
    const recap = new RecapLLM(helper as any);
    await expect(drainStream(recap.generateStream('context', 'sales'))).rejects.toThrow('LLM down');
  });
});
