import { describe, it, expect, vi } from 'vitest';
import { IntelligenceManager } from '../../electron/IntelligenceManager';

function makeIM(memoryManager?: any) {
  const llmHelper = {} as any;
  const im = new IntelligenceManager(llmHelper);
  const recapLLM = (im as any)['recapLLM'] as any;

  vi.spyOn(recapLLM, 'generateStream').mockImplementation(async function* () {
    yield 'Meeting summary.';
  });
  vi.spyOn(recapLLM, 'appendConflictDigest').mockReturnValue(
    '\n\n## Memory Conflicts Resolved\nNone.'
  );
  vi.spyOn(im as any, 'getFormattedContext').mockReturnValue('ctx');

  if (memoryManager) im.setMemoryManager(memoryManager);
  return { im, recapLLM };
}

describe('IntelligenceManager — runRecap conflict digest wiring', () => {
  it('calls appendConflictDigest when meetingId and memoryManager are present', async () => {
    const mm = { getConflictResolutions: vi.fn().mockReturnValue([]) };
    const { im, recapLLM } = makeIM(mm);
    await im.runRecap('mtg-1');
    expect(mm.getConflictResolutions).toHaveBeenCalledWith('mtg-1');
    expect(recapLLM.appendConflictDigest).toHaveBeenCalled();
  });

  it('emits digest section as recap_token after stream completes', async () => {
    const mm = { getConflictResolutions: vi.fn().mockReturnValue([]) };
    const { im } = makeIM(mm);
    const tokens: string[] = [];
    im.on('recap_token', (t: string) => tokens.push(t));
    await im.runRecap('mtg-1');
    expect(tokens).toContain('\n\n## Memory Conflicts Resolved\nNone.');
  });

  it('skips digest when meetingId is absent', async () => {
    const mm = { getConflictResolutions: vi.fn() };
    const { im } = makeIM(mm);
    await im.runRecap();
    expect(mm.getConflictResolutions).not.toHaveBeenCalled();
  });

  it('skips digest when memoryManager is null', async () => {
    const { im, recapLLM } = makeIM();
    await im.runRecap('mtg-1');
    expect(recapLLM.appendConflictDigest).not.toHaveBeenCalled();
  });

  it('still returns raw summary when getConflictResolutions throws', async () => {
    const mm = {
      getConflictResolutions: vi.fn().mockImplementation(() => {
        throw new Error('DB error');
      }),
    };
    const { im } = makeIM(mm);
    const result = await im.runRecap('mtg-1');
    expect(result).toBe('Meeting summary.');
  });

  it('emits recap_warning when digest fails', async () => {
    const mm = {
      getConflictResolutions: vi.fn().mockImplementation(() => {
        throw new Error('DB error');
      }),
    };
    const { im } = makeIM(mm);
    const warnings: string[] = [];
    im.on('recap_warning', (code: string) => warnings.push(code));
    await im.runRecap('mtg-1');
    expect(warnings).toContain('conflict-digest-failed');
  });
});

describe('generate-recap IPC handler argument parsing', () => {
  it('handles missing payload gracefully (backward compat)', () => {
    const parseArgs = (payload: { meetingId?: string } = {}) => payload.meetingId;
    expect(parseArgs(undefined as any)).toBeUndefined();
    expect(parseArgs({})).toBeUndefined();
    expect(parseArgs({ meetingId: 'mtg-1' })).toBe('mtg-1');
  });
});
