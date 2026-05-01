import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { SCHEMA_VERSION } from '../../electron/memory/schema';

describe('runMigration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates all required tables', () => {
    runMigration(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('memory_nodes');
    expect(tables).toContain('memory_edges');
    expect(tables).toContain('memory_facts');
    expect(tables).toContain('pending_review');
    expect(tables).toContain('memory_schema_version');
  });

  it('sets schema version', () => {
    runMigration(db);

    const row = db.prepare('SELECT version FROM memory_schema_version').get() as { version: number };
    expect(row.version).toBe(SCHEMA_VERSION);
  });

  it('is idempotent — running twice produces same row count', () => {
    runMigration(db);

    // Insert a test node
    db.prepare("INSERT INTO memory_nodes (id, kind, label) VALUES ('n1', 'person', 'Alice')").run();

    const countBefore = (db.prepare('SELECT COUNT(*) as cnt FROM memory_nodes').get() as { cnt: number }).cnt;

    // Run migration again
    runMigration(db);

    const countAfter = (db.prepare('SELECT COUNT(*) as cnt FROM memory_nodes').get() as { cnt: number }).cnt;
    expect(countAfter).toBe(countBefore);
  });

  it('does not duplicate schema version on repeated runs', () => {
    runMigration(db);
    runMigration(db);
    runMigration(db);

    const rows = db.prepare('SELECT version FROM memory_schema_version').all();
    expect(rows.length).toBe(1);
  });
});
