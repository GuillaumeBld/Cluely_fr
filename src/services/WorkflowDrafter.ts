import type { ActionItem, KBCitation, WorkflowDraft } from '../types/workflows';
import type { LLMClient } from './RecapLLM';

export interface KBService {
  queryCitations(text: string, limit: number): Promise<KBCitation[]>;
}

export interface GoalAligner {
  getGoalTag(text: string): Promise<string>;
}

let draftCounter = 0;

const DRAFTING_PROMPT = `Given the following action item and template, compose a structured job payload.
Return valid JSON with fields: title (string), description (string), steps (string array).
Only return JSON, no markdown fences.

ACTION ITEM: `;

export async function draft(
  item: ActionItem,
  templateId: string,
  deps: {
    llmClient: LLMClient;
    kbService: KBService;
    goalAligner: GoalAligner;
  },
): Promise<WorkflowDraft> {
  const [kbCitations, goalTag] = await Promise.all([
    deps.kbService.queryCitations(item.text, 3),
    deps.goalAligner.getGoalTag(item.text),
  ]);

  const prompt = `${DRAFTING_PROMPT}${item.text}\nTEMPLATE: ${templateId}\nCONTEXT: ${item.rawExcerpt}`;
  const response = await deps.llmClient.chat(prompt);

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed: { title?: string; description?: string; steps?: string[] } = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[WorkflowDrafter] Failed to parse LLM response:', cleaned.slice(0, 200), err);
  }

  draftCounter += 1;
  const id = `draft-${Date.now()}-${draftCounter}`;

  return {
    id,
    templateId,
    confidence: 0,
    payload: {
      title: parsed.title ?? item.text,
      description: parsed.description ?? '',
      steps: parsed.steps ?? [],
    },
    kbCitations,
    goalTag,
    rawExcerpt: item.rawExcerpt,
    speaker: item.speaker,
    timestamp: item.timestamp,
  };
}
