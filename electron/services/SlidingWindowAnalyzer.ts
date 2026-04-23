import { LunrIndexer, SpeakerTurn } from "./LunrIndexer";
import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";

const COMMITMENT_PATTERNS: Array<{
  re: RegExp;
  type: DecisionCapturedEvent["type"];
}> = [
  { re: /\bi'?ll\b/i, type: "commitment" },
  { re: /\byou should\b/i, type: "ownership" },
  { re: /\baction item\b/i, type: "ownership" },
  { re: /\bwe agreed\b/i, type: "commitment" },
  {
    re: /\bby (monday|tuesday|wednesday|thursday|friday|end of (day|week))\b/i,
    type: "deadline",
  },
  { re: /\bstill unresolved\b|\bblocked on\b/i, type: "unresolved" },
];

export class SlidingWindowAnalyzer {
  private intervalId: NodeJS.Timeout | null = null;
  private seenTurnIds = new Set<string>();
  private meetingId = "";

  constructor(
    private indexer: LunrIndexer,
    private windowSeconds = 300,
    private intervalMs = 90_000
  ) {}

  start(meetingId: string): void {
    this.meetingId = meetingId;
    this.seenTurnIds.clear();
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  tick(): void {
    const turns = this.indexer.getWindow(this.windowSeconds);
    for (const turn of turns) {
      if (this.seenTurnIds.has(turn.turn_id)) continue;
      for (const { re, type } of COMMITMENT_PATTERNS) {
        if (re.test(turn.text)) {
          this.seenTurnIds.add(turn.turn_id);
          IpcEventBus.emitTyped("decision:captured", {
            type,
            speaker: turn.speaker,
            timestamp: turn.timestamp,
            text_excerpt: turn.text.slice(0, 200),
            confidence: 0.7,
            meeting_id: this.meetingId,
            turn_id: turn.turn_id,
          });
          break; // one event per turn
        }
      }
    }
  }
}
