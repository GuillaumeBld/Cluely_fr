import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PermissionsAuditLog } from '../../electron/services/PermissionsAuditLog';

describe('PermissionsAuditLog', () => {
  let db: Database.Database;
  let log: PermissionsAuditLog;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE agent_access_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type   TEXT NOT NULL,
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        purpose     TEXT NOT NULL
      );
    `);
    log = new PermissionsAuditLog(db);
  });

  it('append inserts a row and queryRecent returns it', () => {
    log.append({ dataType: 'calendar', purpose: 'pre-meeting-brief' });

    const rows = log.queryRecent(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe('calendar');
    expect(rows[0].purpose).toBe('pre-meeting-brief');
    expect(rows[0].accessed_at).toBeDefined();
  });

  it('queryRecent respects the limit', () => {
    log.append({ dataType: 'calendar', purpose: 'scan-1' });
    log.append({ dataType: 'ledger', purpose: 'staleness-check' });
    log.append({ dataType: 'calendar', purpose: 'scan-2' });

    const rows = log.queryRecent(2);
    expect(rows).toHaveLength(2);
    // Most recent first
    expect(rows[0].purpose).toBe('scan-2');
    expect(rows[1].purpose).toBe('staleness-check');
  });

  it('queryRecent returns empty array when no entries exist', () => {
    const rows = log.queryRecent(10);
    expect(rows).toHaveLength(0);
  });
});
