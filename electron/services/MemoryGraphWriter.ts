import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";
import { MemoryManager } from "../memory/MemoryManager";
import { NodeKind, EdgePredicate } from "../memory/schema";

// Map event type to edge predicate
const TYPE_TO_PREDICATE: Record<DecisionCapturedEvent['type'], { sourceKind: NodeKind; targetKind: NodeKind; predicate: EdgePredicate }> = {
  ownership:   { sourceKind: 'person', targetKind: 'project',    predicate: 'works_on'  },
  commitment:  { sourceKind: 'person', targetKind: 'commitment', predicate: 'owes'      },
  deadline:    { sourceKind: 'person', targetKind: 'commitment', predicate: 'owes'      },
  unresolved:  { sourceKind: 'person', targetKind: 'decision',   predicate: 'discussed' },
};

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
      const mm = MemoryManager.getInstance();
      const mapping = TYPE_TO_PREDICATE[e.type];
      if (!mapping) return;

      const source = mm.upsertNode(mapping.sourceKind, e.speaker);
      const target = mm.upsertNode(mapping.targetKind, e.text_excerpt.slice(0, 120));

      const result = mm.proposeEdge(
        source.id,
        target.id,
        mapping.predicate,
        e.confidence,
        e.meeting_id,
        e.text_excerpt,
      );
      console.log(`[MemoryGraphWriter] ${result.stored}: ${mapping.predicate} by ${e.speaker} (conf=${e.confidence})`);
    } catch (err) {
      console.warn('[MemoryGraphWriter] write skipped (DB unavailable):', err);
    }
  }
}
