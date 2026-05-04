import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryManager } from '../../electron/memory/MemoryManager';

// Collect registered ipcMain handlers
const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  },
  app: {
    getPath: () => '/tmp/cluely-test',
  },
}));

// Mock AppState to control RAGManager/EmbeddingPipeline availability
const mockGetEmbedding = vi.fn();
const mockIsReady = vi.fn(() => true);
const mockPipeline = { isReady: mockIsReady, getEmbedding: mockGetEmbedding };
const mockGetEmbeddingPipeline = vi.fn(() => mockPipeline);
const mockRAGManager = { getEmbeddingPipeline: mockGetEmbeddingPipeline };
const mockGetRAGManager = vi.fn(() => mockRAGManager);
const mockAppState = { getRAGManager: mockGetRAGManager };

vi.mock('../../electron/main', () => ({
  AppState: {
    getInstance: () => mockAppState,
  },
}));

import { registerMemoryHandlers } from '../../electron/ipc/memoryHandlers';

describe('memoryHandlers', () => {
  let db: Database.Database;
  let mm: MemoryManager;

  beforeEach(() => {
    handlers.clear();
    MemoryManager.resetInstance();
    db = new Database(':memory:');
    mm = MemoryManager.getInstance(db);
    registerMemoryHandlers();
  });

  afterEach(() => {
    db.close();
    MemoryManager.resetInstance();
  });

  it('registers all 8 IPC channels', () => {
    expect(handlers.has('memory:get-nodes')).toBe(true);
    expect(handlers.has('memory:get-edges-from')).toBe(true);
    expect(handlers.has('memory:get-edges-to')).toBe(true);
    expect(handlers.has('memory:get-facts')).toBe(true);
    expect(handlers.has('memory:pending-review')).toBe(true);
    expect(handlers.has('memory:resolve-review')).toBe(true);
    expect(handlers.has('memory:find-similar')).toBe(true);
    expect(handlers.has('memory:embed-fact')).toBe(true);
  });

  it('memory:get-nodes delegates to findNodes', () => {
    mm.upsertNode('person', 'Alice');
    mm.upsertNode('topic', 'GraphQL');

    const result = handlers.get('memory:get-nodes')!({}, 'person');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Alice');
  });

  it('memory:get-nodes with no args returns all nodes', () => {
    mm.upsertNode('person', 'Alice');
    mm.upsertNode('topic', 'GraphQL');

    const result = handlers.get('memory:get-nodes')!({});
    expect(result).toHaveLength(2);
  });

  it('memory:get-edges-from delegates to getEdgesFrom', () => {
    const a = mm.upsertNode('person', 'Alice');
    const b = mm.upsertNode('project', 'App');
    mm.proposeEdge(a.id, b.id, 'works_on', 0.9);

    const result = handlers.get('memory:get-edges-from')!({}, a.id);
    expect(result).toHaveLength(1);
    expect(result[0].predicate).toBe('works_on');
  });

  it('memory:get-edges-to delegates to getEdgesTo', () => {
    const a = mm.upsertNode('person', 'Alice');
    const b = mm.upsertNode('project', 'App');
    mm.proposeEdge(a.id, b.id, 'works_on', 0.9);

    const result = handlers.get('memory:get-edges-to')!({}, b.id);
    expect(result).toHaveLength(1);
  });

  it('memory:get-facts delegates to getFacts', () => {
    const a = mm.upsertNode('person', 'Alice');
    mm.upsertFact(a.id, 'email', 'alice@example.com');

    const result = handlers.get('memory:get-facts')!({}, a.id);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('alice@example.com');
  });

  it('memory:pending-review delegates to getPendingReview', () => {
    const a = mm.upsertNode('person', 'Alice');
    const b = mm.upsertNode('person', 'Bob');
    mm.proposeEdge(a.id, b.id, 'knows', 0.3, null, 'low confidence');

    const result = handlers.get('memory:pending-review')!({});
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.3);
  });

  it('memory:resolve-review delegates to resolveReview', () => {
    const a = mm.upsertNode('person', 'Alice');
    const b = mm.upsertNode('person', 'Bob');
    mm.proposeEdge(a.id, b.id, 'knows', 0.3, null, 'test');

    const pending = mm.getPendingReview();
    const result = handlers.get('memory:resolve-review')!({}, pending[0].id, true);
    expect(result).toEqual({ resolved: true });

    // After approval, should appear as an edge
    const edges = mm.getEdgesFrom(a.id);
    expect(edges).toHaveLength(1);
  });

  describe('memory:find-similar', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockIsReady.mockReturnValue(true);
      mockGetRAGManager.mockReturnValue(mockRAGManager);
    });

    it('returns error for empty text', async () => {
      const result = await handlers.get('memory:find-similar')!({}, '');
      expect(result).toEqual({ error: 'text required' });
    });

    it('returns error for whitespace-only text', async () => {
      const result = await handlers.get('memory:find-similar')!({}, '   ');
      expect(result).toEqual({ error: 'text required' });
    });

    it('returns error when RAGManager is unavailable', async () => {
      mockGetRAGManager.mockReturnValue(null);
      const result = await handlers.get('memory:find-similar')!({}, 'hello');
      expect(result).toEqual({ error: 'RAGManager not available' });
    });

    it('returns error when EmbeddingPipeline is not ready', async () => {
      mockIsReady.mockReturnValue(false);
      const result = await handlers.get('memory:find-similar')!({}, 'hello');
      expect(result).toEqual({ error: 'EmbeddingPipeline not ready' });
    });

    it('returns success with results on happy path', async () => {
      const fakeVec = Array.from({ length: 768 }, () => 0.1);
      mockGetEmbedding.mockResolvedValue(fakeVec);
      const result = await handlers.get('memory:find-similar')!({}, 'hello', 5);
      expect(result).toMatchObject({ success: true, results: expect.any(Array) });
    });

    it('returns error envelope when pipeline throws', async () => {
      mockGetEmbedding.mockRejectedValue(new Error('API failure'));
      const result = await handlers.get('memory:find-similar')!({}, 'hello');
      expect(result).toMatchObject({ success: false, error: 'API failure' });
    });
  });

  describe('memory:embed-fact', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockIsReady.mockReturnValue(true);
      mockGetRAGManager.mockReturnValue(mockRAGManager);
    });

    it('returns error for non-number factId', async () => {
      const result = await handlers.get('memory:embed-fact')!({}, 'notanumber', 'text');
      expect(result).toEqual({ error: 'factId must be a number' });
    });

    it('returns error for empty text', async () => {
      const result = await handlers.get('memory:embed-fact')!({}, 1, '');
      expect(result).toEqual({ error: 'text required' });
    });

    it('returns error when RAGManager is unavailable', async () => {
      mockGetRAGManager.mockReturnValue(null);
      const result = await handlers.get('memory:embed-fact')!({}, 1, 'text');
      expect(result).toEqual({ error: 'RAGManager not available' });
    });

    it('returns error when EmbeddingPipeline is not ready', async () => {
      mockIsReady.mockReturnValue(false);
      const result = await handlers.get('memory:embed-fact')!({}, 1, 'text');
      expect(result).toEqual({ error: 'EmbeddingPipeline not ready' });
    });

    it('returns success when fact exists and embedding stored', async () => {
      const node = mm.upsertNode('person', 'Alice');
      const fact = mm.upsertFact(node.id, 'role', 'engineer');
      const fakeVec = Array.from({ length: 768 }, () => 0.2);
      mockGetEmbedding.mockResolvedValue(fakeVec);
      const result = await handlers.get('memory:embed-fact')!({}, fact.id, 'engineer');
      expect(result).toEqual({ success: true });
    });

    it('returns error envelope when pipeline throws', async () => {
      mockGetEmbedding.mockRejectedValue(new Error('quota exceeded'));
      const node = mm.upsertNode('person', 'Bob');
      const fact = mm.upsertFact(node.id, 'role', 'manager');
      const result = await handlers.get('memory:embed-fact')!({}, fact.id, 'manager');
      expect(result).toMatchObject({ success: false, error: 'quota exceeded' });
    });
  });
});
