import { describe, it, expect, vi } from 'vitest';
import { TaskGeneratorContext } from '../../electron/corpus/TaskGeneratorContext';

describe('TaskGeneratorContext', () => {
  it('injects corpus chunks into system prompt', async () => {
    const mockRetriever = {
      query: vi.fn().mockResolvedValue([
        { id: 'c1', project_id: 'proj-1', source_path: 'src/auth.ts', chunk_text: 'token handling', commit_hash: null, score: 0.9 },
        { id: 'c2', project_id: 'proj-1', source_path: 'src/db.ts', chunk_text: 'database code', commit_hash: 'abc123', score: 0.7 },
      ]),
    };

    const ctx = new TaskGeneratorContext({
      retriever: mockRetriever as any,
      projectId: 'proj-1',
    });

    const { prompt, citations } = await ctx.buildSystemPrompt('auth token meeting transcript');

    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('token handling');
    expect(prompt).toContain('Local KB Context');
    expect(citations).toHaveLength(2);
    expect(citations[0].source_path).toBe('src/auth.ts');
    expect(citations[0].score).toBe(0.9);
  });

  it('returns empty prompt when no chunks found', async () => {
    const mockRetriever = {
      query: vi.fn().mockResolvedValue([]),
    };

    const ctx = new TaskGeneratorContext({
      retriever: mockRetriever as any,
      projectId: 'proj-1',
    });

    const { prompt, citations } = await ctx.buildSystemPrompt('some meeting text');
    expect(prompt).toBe('');
    expect(citations).toHaveLength(0);
  });

  it('includes commit hash in citation when present', async () => {
    const mockRetriever = {
      query: vi.fn().mockResolvedValue([
        { id: 'c1', project_id: 'proj-1', source_path: 'git:commit', chunk_text: 'feat: add auth', commit_hash: 'deadbeef', score: 0.8 },
      ]),
    };

    const ctx = new TaskGeneratorContext({
      retriever: mockRetriever as any,
      projectId: 'proj-1',
    });

    const { prompt, citations } = await ctx.buildSystemPrompt('commit review');
    expect(prompt).toContain('deadbeef');
    expect(citations[0].commit_hash).toBe('deadbeef');
  });

  it('warns when corpus is stale but still returns results', async () => {
    const mockRetriever = {
      query: vi.fn().mockResolvedValue([
        { id: 'c1', project_id: 'proj-1', source_path: 'src/a.ts', chunk_text: 'code', commit_hash: null, score: 0.5 },
      ]),
    };

    const mockGuard = {
      check: vi.fn().mockReturnValue({ stale: true, lastIndexedAt: Date.now() - 5 * 3_600_000, ageHours: 5 }),
    };

    const ctx = new TaskGeneratorContext({
      retriever: mockRetriever as any,
      freshnessGuard: mockGuard as any,
      projectId: 'proj-1',
    });

    const { citations } = await ctx.buildSystemPrompt('meeting text');
    expect(citations).toHaveLength(1);
    expect(mockGuard.check).toHaveBeenCalledWith('proj-1');
  });
});
