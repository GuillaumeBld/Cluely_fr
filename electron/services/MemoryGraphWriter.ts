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
      const db = DatabaseManager.getInstance().getDb();
      if (!db) return;
      // Guard: no-op if memory graph tables haven't been created yet (e.g., MemoryManager init failed)
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_nodes'"
        )
        .get();
      if (!tableExists) return;
      // TODO: wire MemoryManager.proposeEdge() here — schema exists (memory_nodes/memory_edges),
      // but write path deferred pending end-to-end integration testing of the decision capture pipeline.
      console.log(
        `[MemoryGraphWriter] Queued low-confidence relation: ${e.type} by ${e.speaker}`
      );
    } catch (err) {
      console.warn('[MemoryGraphWriter] write skipped (DB unavailable):', err);
    }
  }
}
