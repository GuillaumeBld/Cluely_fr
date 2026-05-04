import { v4 as uuidv4 } from 'uuid';
import type { LLMHelper } from '../LLMHelper';
import type { EmailMessage } from './EmailManager';
import type { CalendarEvent } from './CalendarManager';
import type { OpenCommitment } from './CommitmentStalenessChecker';

export interface WorkflowDraft {
  id: string;
  templateId: string;
  payload: { title: string; description: string; steps: string[] };
  kbCitations: string[];
  goalTag: string | null;
  speaker: string;
  confidence: number;
  source: 'background-email' | 'background-calendar' | 'background-staleness' | 'background-kb' | 'hermes-pattern';
  tokensUsed: number;
}

const DRAFT_PROMPT = (trigger: string): string =>
  `You are a workflow assistant. Given this trigger, produce a concise actionable workflow draft.
Trigger: ${trigger}

Respond in JSON only, no markdown, no explanation:
{"title":"<short title>","templateId":"<one of: follow-up-email|code-task|research-task|meeting-schedule|document-update>","description":"<1-2 sentences>","steps":["step1","step2","step3"],"confidence":<0.0-1.0>}`;

const TOKENS_PER_DRAFT_ESTIMATE = 600; // conservative estimate for cost tracking

export class BackgroundTriggerDrafter {
  constructor(private llmHelper: LLMHelper) {}

  async draftFromEmail(email: EmailMessage): Promise<WorkflowDraft | null> {
    const trigger = `New email from ${email.sender} (subject: "${email.subject}"): ${email.snippet}`;
    return this._draft(trigger, 'background-email');
  }

  async draftFromCalendarChange(event: CalendarEvent): Promise<WorkflowDraft | null> {
    const trigger = `Upcoming meeting change detected: "${event.title}" at ${event.startTime}`;
    return this._draft(trigger, 'background-calendar');
  }

  async draftFromStaleness(commitment: OpenCommitment): Promise<WorkflowDraft | null> {
    const trigger = `Commitment from ${commitment.speaker} is still pending: "${commitment.text}"`;
    return this._draft(trigger, 'background-staleness');
  }

  async draftFromKBUpdate(update: { summary: string }): Promise<WorkflowDraft | null> {
    const trigger = `Knowledge base was updated: ${update.summary}`;
    return this._draft(trigger, 'background-kb');
  }

  private async _draft(
    trigger: string,
    source: WorkflowDraft['source'],
  ): Promise<WorkflowDraft | null> {
    try {
      const raw = await this.llmHelper.chat(DRAFT_PROMPT(trigger));
      const parsed = JSON.parse(raw) as {
        title: string;
        templateId: string;
        description: string;
        steps: string[];
        confidence: number;
      };
      return {
        id: uuidv4(),
        templateId: parsed.templateId ?? 'research-task',
        payload: {
          title: parsed.title,
          description: parsed.description,
          steps: parsed.steps ?? [],
        },
        kbCitations: [],
        goalTag: null,
        speaker: 'background-agent',
        confidence: parsed.confidence ?? 0.7,
        source,
        tokensUsed: TOKENS_PER_DRAFT_ESTIMATE,
      };
    } catch (err) {
      console.warn('[BackgroundTriggerDrafter] Failed to draft:', err);
      return null;
    }
  }
}
