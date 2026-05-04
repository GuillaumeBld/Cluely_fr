/**
 * PostMeetingPipeline — wires action items from processAndSaveMeeting into:
 *   1. PostMeetingProcessor (ledger + memory graph via relation extraction)
 *   2. WorkflowDrafter (classify → draft → push approval:drafts-ready to renderer)
 *
 * Called by IntelligenceManager.processAndSaveMeeting() after action items are built.
 * Runs fire-and-forget — exceptions are caught and logged, never bubble up.
 */

import { BrowserWindow } from 'electron';
import type { LLMHelper } from '../LLMHelper';

export interface PipelineActionItem {
  text: string;
  speaker: string;
  timestamp: string;
}

export interface PipelineInput {
  meetingId: string;
  transcriptText: string;  // full [SPEAKER]: text joined
  actionItems: PipelineActionItem[];
  decisionHints: string;  // pre-built decision buffer block (may be empty)
}

// ── Keyword-based template classifier (no embedding model needed at runtime) ──

const TEMPLATE_SEEDS: Array<{ id: string; keywords: RegExp }> = [
  { id: 'code-task',      keywords: /\b(code|implement|feature|fix|bug|debug|test|pull request|review|refactor|deploy|build)\b/i },
  { id: 'follow-up-email', keywords: /\b(email|follow.?up|send|reply|respond|message|draft|reach out|contact)\b/i },
  { id: 'meeting-schedule', keywords: /\b(schedule|meeting|set up|call|sync|calendar|invite|book|time|arrange)\b/i },
  { id: 'document-update', keywords: /\b(document|spec|wiki|page|revise|documentation|edit|readme|write up)\b/i },
  { id: 'research-task',  keywords: /\b(research|investigate|evaluate|compare|analyze|look into|study|explore|assess)\b/i },
];

const DRAFT_PROMPT = (item: PipelineActionItem, templateId: string): string =>
  `You are a silent workflow composer. Given this action item, produce a structured job payload for an Archon workflow.
Action item: "${item.text}"
Speaker: ${item.speaker}
Template type: ${templateId}

Respond in JSON only — no markdown, no explanation:
{"title":"<concise title under 60 chars>","description":"<1-2 sentences>","steps":["step1","step2","step3"]}`;

function classifyItem(text: string): { templateId: string; confidence: number } {
  for (const { id, keywords } of TEMPLATE_SEEDS) {
    if (keywords.test(text)) return { templateId: id, confidence: 0.75 };
  }
  return { templateId: 'research-task', confidence: 0.45 };
}

async function draftItem(
  item: PipelineActionItem,
  templateId: string,
  llmHelper: LLMHelper,
): Promise<{ title: string; description: string; steps: string[] }> {
  try {
    const raw = await llmHelper.chat(DRAFT_PROMPT(item, templateId));
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      title: parsed.title ?? item.text.slice(0, 60),
      description: parsed.description ?? '',
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    };
  } catch {
    return { title: item.text.slice(0, 60), description: '', steps: [] };
  }
}

function broadcast(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  });
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runPostMeetingPipeline(
  input: PipelineInput,
  llmHelper: LLMHelper,
): Promise<void> {
  const { meetingId, transcriptText, actionItems } = input;

  // 1. PostMeetingProcessor — ledger + relation extraction
  try {
    const { PostMeetingProcessor } = require('./PostMeetingProcessor');
    const { DecisionLedger } = require('./DecisionLedger');
    const { GoalAligner } = require('./GoalAligner');
    const { DatabaseManager } = require('../db/DatabaseManager');
    const { MemoryManager } = require('../memory/MemoryManager');

    const db = DatabaseManager.getInstance().getDb();
    if (db) {
      const ledger = DecisionLedger.getInstance(db);
      // GoalAligner may not be initialized without an embedder; get instance if available
      let aligner: any;
      try { aligner = GoalAligner.getInstance(); } catch { aligner = { align: async () => null, alignActionItems: async (items: string[]) => items.map((text: string) => ({ text, goal_id: null, goal_confidence: null })) }; }

      const simpleExtractor = {
        extractDecisions: async (transcript: string) => {
          // Use action items already extracted by IntelligenceManager
          return actionItems.map(item => ({
            text: item.text,
            speaker: item.speaker,
            timestamp: item.timestamp,
          }));
        },
      };

      const mm = MemoryManager.getInstance();
      const processor = PostMeetingProcessor.getInstance(ledger, aligner, simpleExtractor, undefined, mm);
      await processor.run(meetingId, transcriptText);
    }
  } catch (err) {
    console.warn('[PostMeetingPipeline] PostMeetingProcessor failed:', err);
  }

  // 2. WorkflowDrafter — classify + draft → push to ApprovalTray
  if (actionItems.length === 0) return;

  try {
    const drafts: unknown[] = [];
    for (const item of actionItems) {
      const { templateId, confidence } = classifyItem(item.text);
      if (confidence < 0.4) continue;

      const payload = await draftItem(item, templateId, llmHelper);
      drafts.push({
        id: `draft-${meetingId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        templateId,
        confidence,
        payload,
        kbCitations: [],
        goalTag: null,
        speaker: item.speaker,
        timestamp: item.timestamp,
        rawExcerpt: item.text,
        source: 'post-meeting',
      });
    }

    if (drafts.length > 0) {
      broadcast('approval:drafts-ready', { drafts, meetingId });
      console.log(`[PostMeetingPipeline] ${drafts.length} workflow draft(s) pushed to ApprovalTray`);
    }
  } catch (err) {
    console.warn('[PostMeetingPipeline] WorkflowDrafter step failed:', err);
  }
}
