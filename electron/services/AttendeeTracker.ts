import { BrowserWindow } from 'electron';
import { IpcEventBus } from './IpcEventBus';
import { LunrIndexer } from './LunrIndexer';
import { MemoryManager } from '../memory/MemoryManager';
import { NodeKind, EdgePredicate } from '../memory/schema';

export interface AttendeeRelation {
  predicate: EdgePredicate;
  targetLabel: string;
  targetKind: NodeKind;
  weight: number;
  direction: 'outbound' | 'inbound';
}

export interface AttendeeFact {
  key: string;
  value: string;
  confidence: number;
}

export interface AttendeeCard {
  speaker: string;
  personNodeId: string;
  relations: AttendeeRelation[];
  facts: AttendeeFact[];
}

const TICK_INTERVAL_MS = 5000;

const RELEVANT_PREDICATES = new Set<EdgePredicate>([
  'reports_to', 'agreed_with', 'works_on', 'owes', 'decided', 'knows',
]);

export class AttendeeTracker {
  private startHandler: (payload: { meeting_id: string }) => void;
  private endHandler: (payload: { meeting_id: string }) => void;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private knownSpeakers: Set<string> = new Set();
  private attendees: Map<string, AttendeeCard> = new Map();

  constructor(private lunrIndexer: LunrIndexer) {
    this.startHandler = () => this.start();
    this.endHandler = () => this.stop();
    IpcEventBus.onTyped('meeting:started', this.startHandler);
    IpcEventBus.onTyped('meeting:ended', this.endHandler);
  }

  destroy(): void {
    IpcEventBus.offTyped('meeting:started', this.startHandler);
    IpcEventBus.offTyped('meeting:ended', this.endHandler);
    this.stop();
  }

  private start(): void {
    this.knownSpeakers.clear();
    this.attendees.clear();
    this.intervalHandle = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  private stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private tick(): void {
    const turns = this.lunrIndexer.allTurns();
    for (const turn of turns) {
      const speaker = turn.speaker;
      if (!speaker || this.knownSpeakers.has(speaker)) continue;
      this.knownSpeakers.add(speaker);
      this.enrich(speaker);
    }
  }

  private enrich(speaker: string): void {
    try {
      const mm = MemoryManager.getInstance();
      const node = mm.upsertNode('person', speaker);

      const outEdges = mm.getEdgesFrom(node.id);
      const inEdges = mm.getEdgesTo(node.id);

      const relations: AttendeeRelation[] = [];

      for (const edge of outEdges) {
        if (!RELEVANT_PREDICATES.has(edge.predicate)) continue;
        const target = mm.getNode(edge.target_id);
        if (!target) continue;
        relations.push({
          predicate: edge.predicate,
          targetLabel: target.label,
          targetKind: target.kind,
          weight: edge.weight,
          direction: 'outbound',
        });
      }

      for (const edge of inEdges) {
        if (!RELEVANT_PREDICATES.has(edge.predicate)) continue;
        const source = mm.getNode(edge.source_id);
        if (!source) continue;
        relations.push({
          predicate: edge.predicate,
          targetLabel: source.label,
          targetKind: source.kind,
          weight: edge.weight,
          direction: 'inbound',
        });
      }

      const rawFacts = mm.getFacts(node.id);
      const facts: AttendeeFact[] = rawFacts.map(f => ({
        key: f.key,
        value: f.value,
        confidence: f.confidence,
      }));

      const card: AttendeeCard = { speaker, personNodeId: node.id, relations, facts };
      this.attendees.set(speaker, card);

      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('attendees:updated', {
            meeting_id: '',
            attendees: this.getAttendees(),
          });
        }
      });

      console.log(`[AttendeeTracker] enriched "${speaker}": ${relations.length} relations, ${facts.length} facts`);
    } catch (err) {
      console.warn('[AttendeeTracker] enrich skipped:', err);
    }
  }

  getAttendees(): AttendeeCard[] {
    return [...this.attendees.values()];
  }
}
