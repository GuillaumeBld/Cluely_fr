import { IpcEventBus, DecisionCapturedEvent } from './IpcEventBus';
import { LunrIndexer, SpeakerTurn } from './LunrIndexer';
import { LLMHelper } from '../LLMHelper';

const THROTTLE_MS = 120_000; // 2 minutes

const NUDGE_PROMPT = (recentTurns: SpeakerTurn[], event: DecisionCapturedEvent): string =>
  `You are a real-time meeting advisor watching a live conversation.
Recent transcript:
${recentTurns.slice(-5).map(t => `${t.speaker}: ${t.text}`).join('\n')}

A ${event.type} pattern was just detected: "${event.text_excerpt}" (speaker: ${event.speaker})

Generate ONE brief nudge (max 15 words) to help the participant address what may be missed.

Respond in JSON only, no markdown:
{"message":"<nudge text>"}`;

export class ProactiveAdviceEngine {
  private lastNudgeAt: number | null = null;
  private currentMeetingId = '';
  private readonly decisionHandler: (e: DecisionCapturedEvent) => void;
  private readonly meetingStartedHandler: (e: { meeting_id: string }) => void;
  private readonly meetingEndedHandler: () => void;

  constructor(
    private readonly lunrIndexer: LunrIndexer,
    private readonly llmHelper: LLMHelper,
  ) {
    this.decisionHandler = (e) => void this._handleDecision(e);
    this.meetingStartedHandler = ({ meeting_id }) => {
      this.currentMeetingId = meeting_id;
      this.lastNudgeAt = null;
    };
    this.meetingEndedHandler = () => {
      this.currentMeetingId = '';
      this.lastNudgeAt = null;
    };
    IpcEventBus.onTyped('decision:captured', this.decisionHandler);
    IpcEventBus.onTyped('meeting:started', this.meetingStartedHandler);
    IpcEventBus.onTyped('meeting:ended', this.meetingEndedHandler);
  }

  private async _handleDecision(event: DecisionCapturedEvent): Promise<void> {
    const now = Date.now();
    if (this.lastNudgeAt !== null && now - this.lastNudgeAt < THROTTLE_MS) return;

    const message = await this._generateNudge(event);
    if (!message) return;

    this.lastNudgeAt = now;
    IpcEventBus.emitTyped('proactive:nudge', {
      message,
      meeting_id: this.currentMeetingId,
      timestamp: now,
    });
  }

  private async _generateNudge(event: DecisionCapturedEvent): Promise<string | null> {
    try {
      const recentTurns = this.lunrIndexer.getWindow(300);
      const raw = await this.llmHelper.chat(NUDGE_PROMPT(recentTurns, event));
      const parsed = JSON.parse(raw) as { message: string };
      return typeof parsed.message === 'string' ? parsed.message : null;
    } catch (err) {
      console.warn('[ProactiveAdviceEngine] Failed to generate nudge:', err);
      return null;
    }
  }

  dispose(): void {
    IpcEventBus.offTyped('decision:captured', this.decisionHandler);
    IpcEventBus.offTyped('meeting:started', this.meetingStartedHandler);
    IpcEventBus.offTyped('meeting:ended', this.meetingEndedHandler);
  }
}
