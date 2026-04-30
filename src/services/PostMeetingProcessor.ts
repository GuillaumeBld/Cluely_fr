import type { ActionItem, WorkflowDraft } from '../types/workflows';
import type { LLMClient } from './RecapLLM';
import type { EmbeddingClient } from './WorkflowClassifier';
import type { KBService, GoalAligner } from './WorkflowDrafter';
import { extractActionItems } from './RecapLLM';
import { classify } from './WorkflowClassifier';
import { draft } from './WorkflowDrafter';

export interface DraftsReadyEmitter {
  send(channel: string, payload: { drafts: WorkflowDraft[] }): void;
}

export interface PostMeetingDeps {
  llmClient: LLMClient;
  embeddingClient: EmbeddingClient;
  kbService: KBService;
  goalAligner: GoalAligner;
  emitter: DraftsReadyEmitter;
}

export async function run(
  transcript: string,
  _meetingId: string,
  deps: PostMeetingDeps,
): Promise<WorkflowDraft[]> {
  const actionItems: ActionItem[] = await extractActionItems(transcript, deps.llmClient);

  if (actionItems.length === 0) {
    return [];
  }

  const drafts: WorkflowDraft[] = [];

  for (const item of actionItems) {
    try {
      const classification = await classify(item, deps.embeddingClient);

      const workflowDraft = await draft(item, classification.templateId, {
        llmClient: deps.llmClient,
        kbService: deps.kbService,
        goalAligner: deps.goalAligner,
      });

      workflowDraft.confidence = classification.confidence;
      drafts.push(workflowDraft);
    } catch (err) {
      console.error('[PostMeetingProcessor] Failed to process action item, skipping:', item.text.slice(0, 80), err);
    }
  }

  deps.emitter.send('approval:drafts-ready', { drafts });

  return drafts;
}
