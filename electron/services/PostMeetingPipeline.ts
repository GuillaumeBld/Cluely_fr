/**
 * PostMeetingPipeline — wires action items from processAndSaveMeeting into:
 *   1. PostMeetingProcessor (ledger + memory graph via relation extraction + MacroRunner)
 *   2. ConflictDetector (extract triples → detect contradictions → broadcast surfaced pairs)
 *   3. WorkflowDrafter (classify → corpus citations → draft → push approval:drafts-ready)
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

  // ── Shared deps ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mm: any = null;
  let activeProjectId: string | null = null;

  try {
    const { DatabaseManager } = require('../db/DatabaseManager');
    const { MemoryManager } = require('../memory/MemoryManager');
    db = DatabaseManager.getInstance().getDb();
    mm = MemoryManager.getInstance();
    try {
      const { ProjectContextSwitcher } = require('./ProjectContextSwitcher');
      activeProjectId = ProjectContextSwitcher.getInstance()?.getActiveProject()?.projectId ?? null;
    } catch { /* optional */ }
  } catch { /* non-fatal */ }

  // ── 1. PostMeetingProcessor — ledger + relation extraction + MacroRunner ──
  try {
    const { PostMeetingProcessor } = require('./PostMeetingProcessor');
    const { DecisionLedger } = require('./DecisionLedger');
    const { GoalAligner } = require('./GoalAligner');

    if (db) {
      const ledger = DecisionLedger.getInstance(db);
      let aligner: any;
      try { aligner = GoalAligner.getInstance(); } catch {
        aligner = { align: async (): Promise<null> => null, alignActionItems: async (items: string[]): Promise<Array<{ text: string; goal_id: null; goal_confidence: null }>> => items.map((text: string): { text: string; goal_id: null; goal_confidence: null } => ({ text, goal_id: null, goal_confidence: null })) };
      }

      const simpleExtractor = {
        extractDecisions: async () => actionItems.map(item => ({
          text: item.text, speaker: item.speaker, timestamp: item.timestamp,
        })),
      };

      // Wire MacroRunner — provides cross-session prior-decision context
      let macroRunner: any = undefined;
      try {
        const { LedgerQueryService } = require('./LedgerQueryService');
        const { CrossSessionContextInjector } = require('../../src/services/CrossSessionContextInjector');
        const { MacroRunner } = require('../../src/services/MacroRunner');
        const ledgerSvc = LedgerQueryService.getInstance(db);
        // Adapter: CrossSessionContextInjector.getCommitments(days) → LedgerQueryService.queryByDateRange
        const ledgerAdapter = {
          getCommitments: (days: number) => {
            const since = new Date(Date.now() - days * 86400000).toISOString();
            return ledgerSvc.queryByDateRange(since, new Date().toISOString());
          },
        };
        macroRunner = new MacroRunner(new CrossSessionContextInjector(ledgerAdapter));
      } catch { /* optional — runs without macro pre-configuration */ }

      // MacroStore — resolve active macro from dispatch_macros table
      let macroStore: any = undefined;
      if (activeProjectId) {
        try {
          macroStore = {
            getActiveMacro: (projectId: string, meetingType: string) =>
              db.prepare('SELECT * FROM dispatch_macros WHERE project_id = ? AND meeting_type = ? LIMIT 1')
                .get(projectId, meetingType) ?? undefined,
          };
        } catch { /* optional */ }
      }

      const llmFn = async (system: string, user: string) => llmHelper.chat(`${system}\n\n${user}`);
      PostMeetingProcessor.resetInstance();
      const processor = PostMeetingProcessor.getInstance(ledger, aligner, simpleExtractor, llmFn, mm);
      await processor.run(meetingId, transcriptText);

      // MacroRunner post-run: pre-configure pipeline context from saved macro
      if (macroRunner && macroStore && activeProjectId) {
        try {
          const { PatternLearner } = require('./PatternLearner');
          const patternLearner = PatternLearner.getInstance?.(db);
          const meetingType = patternLearner?.inferMeetingType?.(meetingId) ?? 'default';
          const macro = macroStore.getActiveMacro(activeProjectId, meetingType);
          if (macro) {
            const macroContext = macroRunner.run(macro, meetingId);
            console.log(`[PostMeetingPipeline] MacroRunner: template=${macroContext.templateId}, ${macroContext.priorDecisions.length} prior decision(s) injected`);
          }
        } catch { /* optional */ }
      }
    }
  } catch (err) {
    console.warn('[PostMeetingPipeline] PostMeetingProcessor failed:', err);
  }

  // ── 2. ConflictDetector — extract triples → detect contradictions ──────────
  if (mm && transcriptText) {
    try {
      const { ConflictDetector } = require('../memory/ConflictDetector');
      const detector = new ConflictDetector(mm);
      const llmFn = async (system: string, user: string) => llmHelper.chat(`${system}\n\n${user}`);
      const result = await detector.run(transcriptText, meetingId, llmFn);
      for (const conflict of result.surfaced) {
        broadcast('conflict:pending', conflict);
      }
      if (result.surfaced.length > 0) {
        console.log(`[PostMeetingPipeline] ${result.surfaced.length} conflict(s) surfaced`);
      }
    } catch (err) {
      console.warn('[PostMeetingPipeline] ConflictDetector failed:', err);
    }
  }

  // ── 3. WorkflowDrafter — classify + corpus citations + draft → ApprovalTray
  if (actionItems.length === 0) return;

  // CorpusRetriever: KB lookup per action item for citations
  let corpusRetriever: any = null;
  if (db && activeProjectId) {
    try {
      const { CorpusRetriever } = require('../corpus/CorpusRetriever');
      const { RAGManager } = require('../rag/RAGManager');
      const embedder = RAGManager.getInstance?.()?.getEmbeddingPipeline?.();
      if (embedder) {
        corpusRetriever = new CorpusRetriever(db, embedder);
      }
    } catch { /* RAG not initialized — citations skipped */ }
  }

  try {
    const drafts: unknown[] = [];
    for (const item of actionItems) {
      const { templateId, confidence } = classifyItem(item.text);
      if (confidence < 0.4) continue;

      let kbCitations: Array<{ source: string; excerpt: string }> = [];
      if (corpusRetriever && activeProjectId) {
        try {
          const chunks = await corpusRetriever.query(item.text, activeProjectId, 3);
          kbCitations = chunks.map((c: any) => ({
            source: c.source_path,
            excerpt: c.chunk_text.slice(0, 200),
          }));
        } catch { /* non-fatal */ }
      }

      const payload = await draftItem(item, templateId, llmHelper);
      drafts.push({
        id: `draft-${meetingId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        templateId,
        confidence,
        payload,
        kbCitations,
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
