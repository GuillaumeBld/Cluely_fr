import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';

describe('goals table migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates goals table with correct columns', () => {
    runMigration(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('goals');

    const columns = db.prepare('PRAGMA table_info(goals)').all() as { name: string; type: string }[];
    const colNames = columns.map(c => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('title');
    expect(colNames).toContain('description');
    expect(colNames).toContain('embedding');
    expect(colNames).toContain('parent_id');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('completed_at');
  });

  it('creates idx_goals_parent index', () => {
    runMigration(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='goals'")
      .all()
      .map((r: any) => r.name);

    expect(indexes).toContain('idx_goals_parent');
  });

  it('allows inserting and querying goals', () => {
    runMigration(db);

    db.prepare(
      "INSERT INTO goals (id, title, description) VALUES ('g1', 'Ship v2', 'Release version 2')"
    ).run();

    const row = db.prepare('SELECT * FROM goals WHERE id = ?').get('g1') as any;
    expect(row.title).toBe('Ship v2');
    expect(row.description).toBe('Release version 2');
    expect(row.completed_at).toBeNull();
  });

  it('supports parent_id self-reference', () => {
    runMigration(db);

    db.prepare("INSERT INTO goals (id, title) VALUES ('parent', 'Top Goal')").run();
    db.prepare("INSERT INTO goals (id, title, parent_id) VALUES ('child', 'Sub Goal', 'parent')").run();

    const child = db.prepare('SELECT * FROM goals WHERE id = ?').get('child') as any;
    expect(child.parent_id).toBe('parent');
  });

  it('is idempotent — running migration twice does not duplicate goals', () => {
    runMigration(db);
    db.prepare("INSERT INTO goals (id, title) VALUES ('g1', 'Test')").run();

    runMigration(db);

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM goals').get() as { cnt: number }).cnt;
    expect(count).toBe(1);
  });
});
