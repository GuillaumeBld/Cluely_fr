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
