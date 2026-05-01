// electron/corpus/TaskGeneratorContext.ts
// Injects corpus citations into task generation prompts

import { CorpusRetriever, CorpusChunk } from './CorpusRetriever';
import { CorpusFreshnessGuard } from './CorpusFreshnessGuard';

export interface TaskCitation {
  source_path: string;
  chunk_text: string;
  commit_hash: string | null;
  score: number;
}

export interface GeneratedTask {
  title: string;
  description: string;
  citations: TaskCitation[];
}

export interface TaskGeneratorContextOptions {
  retriever: CorpusRetriever;
  freshnessGuard?: CorpusFreshnessGuard;
  projectId: string;
  topK?: number;
}

export class TaskGeneratorContext {
  private retriever: CorpusRetriever;
  private freshnessGuard: CorpusFreshnessGuard | null;
  private projectId: string;
  private topK: number;

  constructor(options: TaskGeneratorContextOptions) {
    this.retriever = options.retriever;
    this.freshnessGuard = options.freshnessGuard ?? null;
    this.projectId = options.projectId;
    this.topK = options.topK ?? 5;
  }

  async buildSystemPrompt(transcriptText: string): Promise<{ prompt: string; citations: TaskCitation[] }> {
    // Check freshness if guard is available
    if (this.freshnessGuard) {
      const freshness = this.freshnessGuard.check(this.projectId);
      if (freshness.stale) {
        console.warn(`[TaskGeneratorContext] Corpus index is stale for ${this.projectId} (${freshness.ageHours?.toFixed(1)}h old)`);
      }
    }

    // Query corpus with first 500 chars of transcript as search text
    const queryText = transcriptText.slice(0, 500);
    const chunks = await this.retriever.query(queryText, this.projectId, this.topK);

    const citations = chunks.map(chunkToCitation);

    // Build KB context section
    const kbSection = formatKBSection(chunks);

    const prompt = kbSection;
    return { prompt, citations };
  }
}

function chunkToCitation(chunk: CorpusChunk): TaskCitation {
  return {
    source_path: chunk.source_path,
    chunk_text: chunk.chunk_text,
    commit_hash: chunk.commit_hash,
    score: chunk.score,
  };
}

function formatKBSection(chunks: CorpusChunk[]): string {
  if (chunks.length === 0) return '';

  const entries = chunks.map((c, i) => {
    const source = c.commit_hash
      ? `${c.source_path} (commit: ${c.commit_hash.slice(0, 8)})`
      : c.source_path;
    return `### Source ${i + 1}: ${source}\n\`\`\`\n${c.chunk_text}\n\`\`\``;
  });

  return `## Local KB Context\n\nThe following code/documentation snippets are relevant to this conversation:\n\n${entries.join('\n\n')}`;
}
