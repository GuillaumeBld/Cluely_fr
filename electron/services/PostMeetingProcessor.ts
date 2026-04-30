import Database from 'better-sqlite3';
import { DecisionLedger } from './DecisionLedger';
import { GoalAligner } from './GoalAligner';

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
 * aligns them to goals, and appends to the decision ledger.
 */
export class PostMeetingProcessor {
  private static instance: PostMeetingProcessor | undefined;
  private ledger: DecisionLedger;
  private aligner: GoalAligner;
  private extractor: DecisionExtractor;

  private constructor(
    ledger: DecisionLedger,
    aligner: GoalAligner,
    extractor: DecisionExtractor,
  ) {
    this.ledger = ledger;
    this.aligner = aligner;
    this.extractor = extractor;
  }

  public static getInstance(
    ledger: DecisionLedger,
    aligner: GoalAligner,
    extractor: DecisionExtractor,
  ): PostMeetingProcessor {
    if (!PostMeetingProcessor.instance) {
      PostMeetingProcessor.instance = new PostMeetingProcessor(ledger, aligner, extractor);
    }
    return PostMeetingProcessor.instance;
  }

  public static resetInstance(): void {
    PostMeetingProcessor.instance = undefined;
  }

  /**
   * Process a meeting transcript: extract decisions, align to goals, write to ledger.
   * Returns the number of decisions written.
   */
  public async run(meetingId: string, transcript: string): Promise<number> {
    const decisions = await this.extractor.extractDecisions(transcript);
    let written = 0;

    for (const decision of decisions) {
      const goalId = await this.aligner.align(decision.text);
      const result = this.ledger.append({
        meeting_id: meetingId,
        timestamp: decision.timestamp,
        speaker: decision.speaker,
        text: decision.text,
        goal_id: goalId,
      });
      if (result) written++;
    }

    return written;
  }
}
