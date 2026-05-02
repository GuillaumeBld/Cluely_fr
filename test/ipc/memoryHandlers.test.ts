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
  },
  app: {
    getPath: () => '/tmp/cluely-test',
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

  it('registers all 6 IPC channels', () => {
    expect(handlers.has('memory:get-nodes')).toBe(true);
    expect(handlers.has('memory:get-edges-from')).toBe(true);
    expect(handlers.has('memory:get-edges-to')).toBe(true);
    expect(handlers.has('memory:get-facts')).toBe(true);
    expect(handlers.has('memory:pending-review')).toBe(true);
    expect(handlers.has('memory:resolve-review')).toBe(true);
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
});
