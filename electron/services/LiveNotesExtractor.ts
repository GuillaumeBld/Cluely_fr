import { LunrIndexer, SpeakerTurn } from "./LunrIndexer";
import { IpcEventBus, LiveNoteSnapshot } from "./IpcEventBus";

const ACTION_PATTERNS: RegExp[] = [
  /\bi'?ll\b/i,
  /\bwe('ll| will)\b/i,
  /\byou should\b/i,
  /\baction item\b/i,
  /\bwe agreed\b/i,
  /\bby (monday|tuesday|wednesday|thursday|friday|end of (day|week))\b/i,
  /\bfollow.?up\b/i,
  /\btake ownership\b/i,
];

const DECISION_PATTERNS: RegExp[] = [
  /\bwe decided\b/i,
  /\bwe'?ll go with\b/i,
  /\bfinal decision\b/i,
  /\bagreed to\b/i,
  /\bgoing forward\b/i,
  /\bapproved\b/i,
];

export class LiveNotesExtractor {
  private intervalId: NodeJS.Timeout | null = null;
  private seenTurnIds = new Set<string>();
  private meetingId = "";
  private actionItems: Array<{ speaker: string; text: string }> = [];
  private decisions: Array<{ speaker: string; text: string }> = [];

  constructor(
    private indexer: LunrIndexer,
    private windowSeconds = 3600,
    private intervalMs = 60_000
  ) {}

  start(meetingId: string): void {
    this.meetingId = meetingId;
    this.seenTurnIds.clear();
    this.actionItems = [];
    this.decisions = [];
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  tick(): void {
    try {
      const turns = this.indexer.getWindow(this.windowSeconds);
      let changed = false;

      for (const turn of turns) {
        if (this.seenTurnIds.has(turn.turn_id)) continue;
        this.seenTurnIds.add(turn.turn_id);

        if (ACTION_PATTERNS.some((re) => re.test(turn.text))) {
          this.actionItems.push({ speaker: turn.speaker, text: turn.text.slice(0, 200) });
          changed = true;
        } else if (DECISION_PATTERNS.some((re) => re.test(turn.text))) {
          this.decisions.push({ speaker: turn.speaker, text: turn.text.slice(0, 200) });
          changed = true;
        }
      }

      if (changed) {
        IpcEventBus.emitTyped("notes:updated", {
          meeting_id: this.meetingId,
          timestamp: Date.now(),
          action_items: [...this.actionItems],
          decisions: [...this.decisions],
          turn_count: this.seenTurnIds.size,
        });
      }
    } catch (err) {
      console.warn('[LiveNotesExtractor] tick failed, will retry next interval:', err);
    }
  }
}
