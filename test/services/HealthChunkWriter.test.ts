import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { HealthChunkWriter } from '../../electron/services/HealthChunkWriter';

describe('HealthChunkWriter', () => {
  let db: Database.Database;
  let writer: HealthChunkWriter;

  beforeEach(() => {
    db = new Database(':memory:');
    writer = new HealthChunkWriter(db);
  });

  afterEach(() => {
    db.close();
  });

  it('writes and queries a health chunk', () => {
    const id = writer.writeChunk('# Health data', {
      projectId: 'qualiaai',
      chunkType: 'health-snapshot',
      fetchedAt: new Date().toISOString(),
    });

    expect(id).toBeGreaterThan(0);

    const chunks = writer.queryChunks({ projectId: 'qualiaai', chunkType: 'health-snapshot' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('# Health data');
    expect(chunks[0].projectId).toBe('qualiaai');
    expect(chunks[0].stale).toBe(false);
  });

  it('marks chunk as stale when fetchedAt is >2 hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    writer.writeChunk('# Old data', {
      projectId: 'qualiaai',
      fetchedAt: threeHoursAgo,
    });

    const chunks = writer.queryChunks({ projectId: 'qualiaai' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].stale).toBe(true);
  });

  it('does not mark chunk as stale when fetchedAt is <2 hours ago', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    writer.writeChunk('# Fresh data', {
      projectId: 'qualiaai',
      fetchedAt: oneHourAgo,
    });

    const chunks = writer.queryChunks({ projectId: 'qualiaai' });
    expect(chunks[0].stale).toBe(false);
  });

  it('getLatestChunk returns most recent chunk', () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    const recent = new Date().toISOString();

    writer.writeChunk('# Old', { projectId: 'qualiaai', fetchedAt: old });
    writer.writeChunk('# Recent', { projectId: 'qualiaai', fetchedAt: recent });

    const latest = writer.getLatestChunk('qualiaai');
    expect(latest).not.toBeNull();
    expect(latest!.content).toBe('# Recent');
  });

  it('getLatestChunk returns null for unknown project', () => {
    expect(writer.getLatestChunk('nonexistent')).toBeNull();
  });

  it('markStaleChunks updates old chunks', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    // Write a fresh chunk first (stale=0 at write time — but fetchedAt is old)
    db.prepare(`
      INSERT INTO health_chunks (project_id, chunk_type, content, fetched_at, stale)
      VALUES (?, ?, ?, ?, ?)
    `).run('qualiaai', 'health-snapshot', '# Old', threeHoursAgo, 0);

    const updated = writer.markStaleChunks();
    expect(updated).toBe(1);

    const chunks = writer.queryChunks({ projectId: 'qualiaai' });
    expect(chunks[0].stale).toBe(true);
  });
});
