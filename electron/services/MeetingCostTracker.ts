import type Database from 'better-sqlite3';

export type SpendRow = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

export class MeetingCostTracker {
  private insertStmt: Database.Statement;
  private meetingQueryStmt: Database.Statement;
  private dailyQueryStmt: Database.Statement;
  private dailyTotalStmt: Database.Statement;

  constructor(private db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS llm_cost_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        meeting_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_cents REAL NOT NULL DEFAULT 0
      )
    `);
    this.insertStmt = db.prepare(
      'INSERT INTO llm_cost_log (timestamp, meeting_id, provider, model, input_tokens, output_tokens, cost_cents) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    this.meetingQueryStmt = db.prepare(
      'SELECT provider, model, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens, SUM(cost_cents) as costCents FROM llm_cost_log WHERE meeting_id = ? GROUP BY provider, model',
    );
    this.dailyQueryStmt = db.prepare(
      "SELECT provider, model, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens, SUM(cost_cents) as costCents FROM llm_cost_log WHERE date(timestamp/1000, 'unixepoch') = ? GROUP BY provider, model",
    );
    this.dailyTotalStmt = db.prepare(
      "SELECT COALESCE(SUM(cost_cents), 0) as total FROM llm_cost_log WHERE date(timestamp/1000, 'unixepoch') = ?",
    );
  }

  record(entry: { meetingId: string | null; provider: string; model: string; inputTokens: number; outputTokens: number; costCents: number }): void {
    this.insertStmt.run(Date.now(), entry.meetingId, entry.provider, entry.model, entry.inputTokens, entry.outputTokens, entry.costCents);
  }

  getMeetingSpend(meetingId: string): { totalCents: number; byModel: SpendRow[] } {
    const rows = this.meetingQueryStmt.all(meetingId) as SpendRow[];
    const totalCents = rows.reduce((sum, r) => sum + r.costCents, 0);
    return { totalCents, byModel: rows };
  }

  getDailySpend(date?: string): { totalCents: number; byModel: SpendRow[] } {
    const day = date || new Date().toISOString().slice(0, 10);
    const rows = this.dailyQueryStmt.all(day) as SpendRow[];
    const totalCents = (this.dailyTotalStmt.get(day) as { total: number }).total;
    return { totalCents, byModel: rows };
  }

  isOverDailyBudget(budgetCents: number): boolean {
    const day = new Date().toISOString().slice(0, 10);
    const total = (this.dailyTotalStmt.get(day) as { total: number }).total;
    return total >= budgetCents;
  }
}
