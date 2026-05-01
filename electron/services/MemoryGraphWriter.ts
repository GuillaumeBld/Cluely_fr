import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";
import { DatabaseManager } from "../db/DatabaseManager";

export class MemoryGraphWriter {
  private handler: (e: DecisionCapturedEvent) => void;

  constructor() {
    this.handler = (e) => this.write(e);
    IpcEventBus.onTyped("decision:captured", this.handler);
  }

  destroy(): void {
    IpcEventBus.offTyped("decision:captured", this.handler);
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
    } catch (err) {
      console.warn('[MemoryGraphWriter] write skipped (DB unavailable):', err);
    }
  }
}
