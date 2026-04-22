import { EdgePredicate, NodeKind } from './schema';
import { MemoryManager } from './MemoryManager';

/**
 * A triple proposal extracted from text by the LLM.
 */
export interface TripleProposal {
  sourceKind: NodeKind;
  sourceLabel: string;
  targetKind: NodeKind;
  targetLabel: string;
  predicate: EdgePredicate;
  confidence: number;
  context: string; // snippet that triggered the extraction
}

/**
 * Generic LLM function signature.
 * Takes a system prompt + user text, returns a JSON string of TripleProposal[].
 */
export type LLMFn = (systemPrompt: string, userText: string) => Promise<string>;

const EXTRACTION_SYSTEM_PROMPT = `You are a relation extractor for a personal knowledge graph.
Given a transcript snippet, extract structured triples (subject → predicate → object).

Return a JSON array of objects with these fields:
- sourceKind: one of "person", "topic", "organization", "project", "meeting", "decision"
- sourceLabel: human-readable name
- targetKind: same options as sourceKind
- targetLabel: human-readable name
- predicate: one of "knows", "works_on", "belongs_to", "agreed_with", "owes", "discussed", "decided"
- confidence: number between 0 and 1
- context: the exact snippet that supports this triple

Return ONLY the JSON array, no markdown fences, no explanation.
If no triples can be extracted, return an empty array [].`;

/**
 * Extract relation triples from transcript text using an LLM.
 * Each proposal is then fed through MemoryManager.proposeEdge for confidence gating.
 */
export async function extractRelations(
  text: string,
  meetingId: string | null,
  llmFn: LLMFn,
  memoryManager: MemoryManager,
): Promise<TripleProposal[]> {
  const raw = await llmFn(EXTRACTION_SYSTEM_PROMPT, text);

  let proposals: TripleProposal[];
  try {
    proposals = JSON.parse(raw);
    if (!Array.isArray(proposals)) {
      proposals = [];
    }
  } catch {
    console.error('[RelationExtractor] Failed to parse LLM response:', raw.slice(0, 200));
    return [];
  }

  const valid: TripleProposal[] = [];

  for (const p of proposals) {
    if (!p.sourceLabel || !p.targetLabel || !p.predicate) continue;
    if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) continue;

    // Ensure nodes exist
    const source = memoryManager.upsertNode(
      p.sourceKind || 'topic',
      p.sourceLabel,
    );
    const target = memoryManager.upsertNode(
      p.targetKind || 'topic',
      p.targetLabel,
    );

    // Confidence-gated: goes to edges or pending_review
    memoryManager.proposeEdge(
      source.id,
      target.id,
      p.predicate,
      p.confidence,
      meetingId,
      p.context || text.slice(0, 200),
    );

    valid.push(p);
  }

  return valid;
}
