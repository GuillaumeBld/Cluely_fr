import Database from 'better-sqlite3';
import { ALL_DDL, SCHEMA_VERSION } from './schema';

/**
 * Run memory-graph migrations idempotently.
 * Safe to call on every app launch — CREATE IF NOT EXISTS + version guard.
 */
export function runMigration(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.transaction(() => {
    for (const ddl of ALL_DDL) {
      db.exec(ddl);
    }

    // Seed schema version if table is empty
    const row = db.prepare('SELECT version FROM memory_schema_version LIMIT 1').get() as { version: number } | undefined;
    if (!row) {
      db.prepare('INSERT INTO memory_schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    }
  })();
}

/**
 * Migrate legacy flat-schema tables (memory_session, memory_profile, memory_semantic)
 * into the new memory_facts table.
 *
 * Only runs if the legacy tables exist. Idempotent — skips rows already migrated
 * (keyed on source column containing 'legacy:' prefix).
 */
export function migrateLegacyIfNeeded(db: Database.Database): void {
  // Check if any legacy tables exist
  const legacyTables = ['memory_session', 'memory_profile', 'memory_semantic'];
  const existingTables: string[] = [];

  for (const table of legacyTables) {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table) as { name: string } | undefined;
    if (exists) {
      existingTables.push(table);
    }
  }

  if (existingTables.length === 0) return;

  // Ensure memory graph schema exists before migrating
  runMigration(db);

  db.transaction(() => {
    // Ensure a catch-all "legacy" node exists for orphan facts
    const legacyNodeId = '__legacy__';
    const existingNode = db.prepare('SELECT id FROM memory_nodes WHERE id = ?').get(legacyNodeId);
    if (!existingNode) {
      db.prepare(
        `INSERT INTO memory_nodes (id, kind, label, metadata) VALUES (?, 'person', 'Legacy Import', '{}')`
      ).run(legacyNodeId);
    }

    // Check if we already migrated
    const alreadyMigrated = db.prepare(
      "SELECT COUNT(*) as cnt FROM memory_facts WHERE source LIKE 'legacy:%'"
    ).get() as { cnt: number };
    if (alreadyMigrated.cnt > 0) return; // Already done

    for (const table of existingTables) {
      // SAFETY: `table` comes from the hardcoded `legacyTables` array above, never from user input
      const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);

      if (columns.includes('key') && columns.includes('value')) {
        const rows = db.prepare(`SELECT key, value FROM ${table}`).all() as { key: string; value: string }[];
        for (const row of rows) {
          db.prepare(
            `INSERT INTO memory_facts (node_id, key, value, confidence, source) VALUES (?, ?, ?, 0.5, ?)`
          ).run(legacyNodeId, row.key, row.value, `legacy:${table}`);
        }
      }
    }
  })();
}
