import type Database from 'better-sqlite3';

export interface AuditEntry {
  dataType: string;
  purpose: string;
}

export interface AuditRow {
  id: number;
  data_type: string;
  accessed_at: string;
  purpose: string;
}

export class PermissionsAuditLog {
  private insertStmt: Database.Statement;
  private queryStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(
      'INSERT INTO agent_access_log (data_type, purpose) VALUES (?, ?)',
    );
    this.queryStmt = db.prepare(
      'SELECT * FROM agent_access_log ORDER BY id DESC LIMIT ?',
    );
  }

  append(entry: AuditEntry): void {
    this.insertStmt.run(entry.dataType, entry.purpose);
  }

  queryRecent(limit: number): AuditRow[] {
    return this.queryStmt.all(limit) as AuditRow[];
  }
}
