import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";
import { DatabaseManager } from "../db/DatabaseManager";

export class MemoryGraphWriter {
  constructor() {
    IpcEventBus.onTyped("decision:captured", (e) => this.write(e));
  }
  private write(e: DecisionCapturedEvent): void {
    try {
      const db = DatabaseManager.getInstance().getDatabase();
      // No-op if memory graph tables don't exist yet (Composite A not live)
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_nodes'"
        )
        .get();
      if (!tableExists) return;
      // TODO: insert low-confidence node when Composite A schema is live
      console.log(
        `[MemoryGraphWriter] Queued low-confidence relation: ${e.type} by ${e.speaker}`
      );
    } catch {
      // Silently fail — Composite C must not break if DB is unavailable
    }
  }
}
