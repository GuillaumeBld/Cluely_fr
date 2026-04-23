import { MemoryManager } from './MemoryManager';
import { MemoryFact, NodeKind, PendingConflict } from './schema';
import { TripleProposal, LLMFn } from './RelationExtractor';

/** Maximum conflicts surfaced per meeting; overflow queued. */
const MAX_SURFACED_PER_MEETING = 2;

export interface ConflictPair {
  entity: string;
  relation: string;
  oldValue: string;
  newValue: string;
  speaker: string | null;
  factId: number;
  confidence: number;
}

export interface ConflictDetectionResult {
  surfaced: ConflictPair[];
  queued: PendingConflict[];
}

const TRIPLE_EXTRACTION_PROMPT = `You are an entity-relation-value extractor.
Given a meeting transcript, extract factual claims as triples.

Return a JSON array of objects:
- entity: the subject's name (person, project, etc.)
- relation: what property is being stated (e.g. "role", "owner", "status", "deadline", "location")
- value: the stated value
- speaker: who said it (null if unclear)
- confidence: 0..1 how certain the claim is

Return ONLY the JSON array, no markdown fences.
If no factual claims can be extracted, return [].`;

export interface ExtractedTriple {
  entity: string;
  relation: string;
  value: string;
  speaker: string | null;
  confidence: number;
}

export class ConflictDetector {
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Extract entity-relation-value triples from a transcript via LLM.
   */
  async extractTriples(transcript: string, llmFn: LLMFn): Promise<ExtractedTriple[]> {
    let raw: string;
    try {
      raw = await llmFn(TRIPLE_EXTRACTION_PROMPT, transcript);
    } catch (err) {
      console.error('[ConflictDetector] LLM call failed:', err);
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (t: any) => t.entity && t.relation && t.value && typeof t.confidence === 'number',
      ) as ExtractedTriple[];
    } catch {
      console.error('[ConflictDetector] Failed to parse triples:', raw.slice(0, 200));
      return [];
    }
  }

  /**
   * Compare new triples against stored facts and detect contradictions.
   * A conflict exists when a new triple has the same entity+relation as a stored fact
   * but a different value.
   */
  detectConflicts(newTriples: ExtractedTriple[]): ConflictPair[] {
    const conflicts: ConflictPair[] = [];

    for (const triple of newTriples) {
      const existingFacts = this.memoryManager.queryEntityFacts(triple.entity);

      for (const fact of existingFacts) {
        if (fact.key !== triple.relation) continue;
        if (fact.value === triple.value) continue;

        conflicts.push({
          entity: triple.entity,
          relation: triple.relation,
          oldValue: fact.value,
          newValue: triple.value,
          speaker: triple.speaker,
          factId: fact.id,
          confidence: triple.confidence,
        });
      }
    }

    return conflicts;
  }

  /**
   * Run the full conflict detection pipeline for a meeting transcript.
   * - Extracts triples via LLM
   * - Compares against stored facts
   * - Rate-limits surfaced conflicts to MAX_SURFACED_PER_MEETING
   * - Queues overflow to pending_conflicts table
   */
  async run(
    transcript: string,
    meetingId: string,
    llmFn: LLMFn,
  ): Promise<ConflictDetectionResult> {
    const triples = await this.extractTriples(transcript, llmFn);
    const allConflicts = this.detectConflicts(triples);

    const surfaced = allConflicts.slice(0, MAX_SURFACED_PER_MEETING);
    const overflow = allConflicts.slice(MAX_SURFACED_PER_MEETING);

    const queued: PendingConflict[] = [];
    for (const c of overflow) {
      const pending = this.memoryManager.enqueuePendingConflict(
        meetingId,
        c.entity,
        c.relation,
        c.oldValue,
        c.newValue,
        c.speaker,
      );
      queued.push(pending);
    }

    return { surfaced, queued };
  }
}
