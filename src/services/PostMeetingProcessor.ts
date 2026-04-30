import type { ActionItem, WorkflowDraft } from '../types/workflows';
import type { LLMClient } from './RecapLLM';
import type { EmbeddingClient } from './WorkflowClassifier';
import type { KBService, GoalAligner } from './WorkflowDrafter';
import type { MacroLearner, MacroProposal } from './MacroLearner';
import type { MacroRunner, MacroContext } from './MacroRunner';
import type { DispatchMacro } from '../../electron/memory/schema';
import { extractActionItems } from './RecapLLM';
import { classify } from './WorkflowClassifier';
import { draft } from './WorkflowDrafter';

export interface DraftsReadyEmitter {
  send(channel: string, payload: unknown): void;
}

export interface MacroStore {
  getActiveMacro(projectId: string, meetingType: string): DispatchMacro | undefined;
}

export interface PostMeetingDeps {
  llmClient: LLMClient;
  embeddingClient: EmbeddingClient;
  kbService: KBService;
  goalAligner: GoalAligner;
  emitter: DraftsReadyEmitter;
  macroLearner?: MacroLearner;
  macroRunner?: MacroRunner;
  macroStore?: MacroStore;
  overriddenMeetings?: Set<string>;
  meetingProjectId?: string;
  meetingType?: string;
}

export async function run(
  transcript: string,
  meetingId: string,
  deps: PostMeetingDeps,
): Promise<WorkflowDraft[]> {
  // ── Macro pre-configuration ──────────────────────────────────────
  let macroContext: MacroContext | undefined;

  if (
    deps.macroStore &&
    deps.macroRunner &&
    deps.meetingProjectId &&
    deps.meetingType &&
    !deps.overriddenMeetings?.has(meetingId)
  ) {
    const macro = deps.macroStore.getActiveMacro(deps.meetingProjectId, deps.meetingType);
    if (macro) {
      macroContext = deps.macroRunner.run(macro, meetingId);
    }
  }

  // ── Standard pipeline ────────────────────────────────────────────
  const actionItems: ActionItem[] = await extractActionItems(transcript, deps.llmClient);

  if (actionItems.length === 0) {
    // Still evaluate macro learner even with no action items
    if (deps.macroLearner) {
      const proposal = deps.macroLearner.evaluate(meetingId);
      if (proposal) {
        deps.emitter.send('macro:proposal', { proposal });
      }
    }
    return [];
  }

  const drafts: WorkflowDraft[] = [];

  for (const item of actionItems) {
    try {
      const forcedTemplateId = macroContext?.templateId;
      const classification = await classify(item, deps.embeddingClient);
      const effectiveTemplateId = forcedTemplateId ?? classification.templateId;

      const workflowDraft = await draft(item, effectiveTemplateId, {
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

  // ── Macro learning (post-processing) ─────────────────────────────
  if (deps.macroLearner) {
    const proposal: MacroProposal | null = deps.macroLearner.evaluate(meetingId);
    if (proposal) {
      deps.emitter.send('macro:proposal', { proposal });
    }
  }

  return drafts;
}
