import { v4 as uuidv4 } from 'uuid';
import type { LLMHelper } from '../LLMHelper';
import type { WorkflowDraft } from './BackgroundTriggerDrafter';

export interface HermesPattern {
  kind: 'recurring-blocker' | 'goal-drift' | 'contradiction';
  label: string;
  score: number;
  occurrences?: number;
  ageDays?: number;
  oldValue?: string;
  newValue?: string;
}

const HERMES_DRAFT_PROMPT = (trigger: string): string =>
  `You are a meta-observation assistant. Given this cross-session pattern, produce a concise actionable workflow draft.
Pattern: ${trigger}

Respond in JSON only, no markdown, no explanation:
{"title":"<short title>","templateId":"<one of: follow-up-email|code-task|research-task|meeting-schedule|document-update>","description":"<1-2 sentences>","steps":["step1","step2","step3"],"confidence":<0.0-1.0>}`;

const TOKENS_PER_HERMES_DRAFT_ESTIMATE = 700;

export class HermesDrafter {
  constructor(private llmHelper: LLMHelper) {}

  async draftFromRecurringBlocker(pattern: HermesPattern): Promise<WorkflowDraft | null> {
    const trigger = `Recurring blocker detected: "${pattern.label}" has appeared as a blocker in ${pattern.occurrences} sessions`;
    return this._draft(trigger, 'hermes-pattern');
  }

  async draftFromGoalDrift(pattern: HermesPattern): Promise<WorkflowDraft | null> {
    const trigger = `Goal drift detected: goal "${pattern.label}" is ${pattern.ageDays} days old with no linked decisions`;
    return this._draft(trigger, 'hermes-pattern');
  }

  async draftFromContradiction(pattern: HermesPattern): Promise<WorkflowDraft | null> {
    const trigger = `Contradiction detected: "${pattern.label}" — agreed "${pattern.oldValue}" but later "${pattern.newValue}"`;
    return this._draft(trigger, 'hermes-pattern');
  }

  private async _draft(
    trigger: string,
    source: WorkflowDraft['source'],
  ): Promise<WorkflowDraft | null> {
    try {
      const raw = await this.llmHelper.chat(HERMES_DRAFT_PROMPT(trigger));
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
        speaker: 'hermes-observer',
        confidence: parsed.confidence ?? 0.7,
        source,
        tokensUsed: TOKENS_PER_HERMES_DRAFT_ESTIMATE,
      };
    } catch (err) {
      console.warn('[HermesDrafter] Failed to draft:', err);
      return null;
    }
  }
}
