import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration, migrateLegacyIfNeeded } from '../../electron/memory/migration';

describe('migrateLegacyIfNeeded', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('does nothing when no legacy tables exist', () => {
    runMigration(db);
    migrateLegacyIfNeeded(db);

    const facts = db.prepare('SELECT COUNT(*) as cnt FROM memory_facts').get() as { cnt: number };
    expect(facts.cnt).toBe(0);
  });

  it('migrates legacy memory_session rows into memory_facts', () => {
    // Create legacy table
    db.exec(`
      CREATE TABLE memory_session (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    db.prepare("INSERT INTO memory_session (key, value) VALUES ('last_topic', 'AI Ethics')").run();
    db.prepare("INSERT INTO memory_session (key, value) VALUES ('mood', 'focused')").run();

    migrateLegacyIfNeeded(db);

    const facts = db.prepare('SELECT * FROM memory_facts').all() as any[];
    expect(facts.length).toBe(2);
    expect(facts.every((f: any) => f.source.startsWith('legacy:'))).toBe(true);
    expect(facts.every((f: any) => f.confidence === 0.5)).toBe(true);
  });

  it('migrates multiple legacy tables', () => {
    db.exec("CREATE TABLE memory_session (key TEXT, value TEXT)");
    db.exec("CREATE TABLE memory_profile (key TEXT, value TEXT)");
    db.prepare("INSERT INTO memory_session VALUES ('s1', 'v1')").run();
    db.prepare("INSERT INTO memory_profile VALUES ('p1', 'v2')").run();

    migrateLegacyIfNeeded(db);

    const facts = db.prepare('SELECT * FROM memory_facts').all() as any[];
    expect(facts.length).toBe(2);

    const sources = facts.map((f: any) => f.source);
    expect(sources).toContain('legacy:memory_session');
    expect(sources).toContain('legacy:memory_profile');
  });

  it('is idempotent — second run does not duplicate facts', () => {
    db.exec("CREATE TABLE memory_semantic (key TEXT, value TEXT)");
    db.prepare("INSERT INTO memory_semantic VALUES ('concept', 'neural nets')").run();

    migrateLegacyIfNeeded(db);
    const countFirst = (db.prepare('SELECT COUNT(*) as cnt FROM memory_facts').get() as { cnt: number }).cnt;

    migrateLegacyIfNeeded(db);
    const countSecond = (db.prepare('SELECT COUNT(*) as cnt FROM memory_facts').get() as { cnt: number }).cnt;

    expect(countSecond).toBe(countFirst);
  });

  it('skips legacy tables not in the allowlist', () => {
    // Create a non-allowlisted table with key/value columns
    db.exec("CREATE TABLE memory_custom (key TEXT, value TEXT)");
    db.prepare("INSERT INTO memory_custom VALUES ('k', 'v')").run();

    // Also create an allowed table so migration runs
    db.exec("CREATE TABLE memory_session (key TEXT, value TEXT)");
    db.prepare("INSERT INTO memory_session VALUES ('s1', 'v1')").run();

    migrateLegacyIfNeeded(db);

    const facts = db.prepare('SELECT * FROM memory_facts').all() as any[];
    // Only the session row should be migrated, not the custom table
    expect(facts.length).toBe(1);
    expect(facts[0].source).toBe('legacy:memory_session');
  });

  it('creates a __legacy__ node for orphaned facts', () => {
    db.exec("CREATE TABLE memory_session (key TEXT, value TEXT)");
    db.prepare("INSERT INTO memory_session VALUES ('k', 'v')").run();

    migrateLegacyIfNeeded(db);

    const node = db.prepare("SELECT * FROM memory_nodes WHERE id = '__legacy__'").get() as any;
    expect(node).toBeTruthy();
    expect(node.kind).toBe('person');
    expect(node.label).toBe('Legacy Import');
  });
});
