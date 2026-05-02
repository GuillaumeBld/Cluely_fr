import Database from 'better-sqlite3';
import { DecisionLedger } from './DecisionLedger';
import { GoalAligner } from './GoalAligner';
import { extractRelations, LLMFn } from '../memory/RelationExtractor';
import { MemoryManager } from '../memory/MemoryManager';

export interface ExtractedDecision {
  text: string;
  speaker: string;
  timestamp: string;
}

export interface DecisionExtractor {
  extractDecisions(transcript: string): Promise<ExtractedDecision[]>;
}

/**
 * Post-meeting processor: extracts decisions from a transcript,
 * aligns them to goals, appends to the decision ledger,
 * and extracts relation triples into the memory graph.
 */
export class PostMeetingProcessor {
  private static instance: PostMeetingProcessor | undefined;
  private ledger: DecisionLedger;
  private aligner: GoalAligner;
  private extractor: DecisionExtractor;
  private llmFn: LLMFn | null;
  private memoryManager: MemoryManager | null;

  private constructor(
    ledger: DecisionLedger,
    aligner: GoalAligner,
    extractor: DecisionExtractor,
    llmFn?: LLMFn,
    memoryManager?: MemoryManager,
  ) {
    this.ledger = ledger;
    this.aligner = aligner;
    this.extractor = extractor;
    this.llmFn = llmFn ?? null;
    this.memoryManager = memoryManager ?? null;
  }

  public static getInstance(
    ledger: DecisionLedger,
    aligner: GoalAligner,
    extractor: DecisionExtractor,
    llmFn?: LLMFn,
    memoryManager?: MemoryManager,
  ): PostMeetingProcessor {
    if (!PostMeetingProcessor.instance) {
      PostMeetingProcessor.instance = new PostMeetingProcessor(ledger, aligner, extractor, llmFn, memoryManager);
    }
    return PostMeetingProcessor.instance;
  }

  public static resetInstance(): void {
    PostMeetingProcessor.instance = undefined;
  }

  /**
   * Process a meeting transcript: extract decisions, align to goals, write to ledger,
   * then extract relation triples into the memory graph.
   * Returns the number of decisions written.
   */
  public async run(meetingId: string, transcript: string): Promise<number> {
    let decisions: ExtractedDecision[];
    try {
      decisions = await this.extractor.extractDecisions(transcript);
    } catch (err) {
      console.error('[PostMeetingProcessor] Decision extraction failed:', err);
      return 0;
    }

    let written = 0;

    for (const decision of decisions) {
      try {
        const goalId = await this.aligner.align(decision.text);
        const result = this.ledger.append({
          meeting_id: meetingId,
          timestamp: decision.timestamp,
          speaker: decision.speaker,
          text: decision.text,
          goal_id: goalId,
        });
        if (result) written++;
      } catch (err) {
        console.error('[PostMeetingProcessor] Failed to persist decision:', decision.text.slice(0, 80), err);
      }
    }

    // Extract relation triples into the memory graph
    if (this.llmFn && this.memoryManager) {
      try {
        await extractRelations(transcript, meetingId, this.llmFn, this.memoryManager);
      } catch (err) {
        console.error('[PostMeetingProcessor] Relation extraction failed:', err);
      }
    }

    return written;
  }
}
