import type Database from 'better-sqlite3';

export class BackgroundCostTracker {
  private insertStmt: Database.Statement;
  private queryStmt: Database.Statement;

  constructor(private db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bg_agent_cost_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        estimated_cents REAL NOT NULL DEFAULT 0
      )
    `);
    this.insertStmt = db.prepare(
      'INSERT INTO bg_agent_cost_log (date, tokens_used, estimated_cents) VALUES (?, ?, ?)',
    );
    this.queryStmt = db.prepare(
      "SELECT COALESCE(SUM(estimated_cents), 0) as total FROM bg_agent_cost_log WHERE date = ?",
    );
  }

  /** Record usage from one draft generation call. */
  recordUsage(tokensUsed: number, estimatedCents: number): void {
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    this.insertStmt.run(today, tokensUsed, estimatedCents);
  }

  getDailyUsageCents(): number {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.queryStmt.get(today) as { total: number };
    return row.total;
  }

  isOverBudget(budgetCents: number): boolean {
    return this.getDailyUsageCents() >= budgetCents;
  }
}
