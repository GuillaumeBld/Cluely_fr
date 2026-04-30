import type { ActionItem, WorkflowTemplate } from '../types/workflows';
import { getAll } from './WorkflowTemplateRegistry';

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
}

export interface ClassificationResult {
  templateId: string;
  confidence: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

let templateEmbeddings: Map<string, number[]> | null = null;

export async function initEmbeddings(embeddingClient: EmbeddingClient): Promise<void> {
  const templates = getAll();
  templateEmbeddings = new Map();
  for (const template of templates) {
    const embedding = await embeddingClient.embed(template.embeddingSeed);
    templateEmbeddings.set(template.id, embedding);
  }
}

export async function classify(
  item: ActionItem,
  embeddingClient: EmbeddingClient,
): Promise<ClassificationResult> {
  if (!templateEmbeddings) {
    await initEmbeddings(embeddingClient);
  }

  const itemEmbedding = await embeddingClient.embed(item.text);

  let bestId = 'unknown';
  let bestScore = -1;

  for (const [templateId, templateEmbedding] of templateEmbeddings!) {
    const score = cosineSimilarity(itemEmbedding, templateEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestId = templateId;
    }
  }

  if (bestScore < 0.5) {
    return { templateId: 'unknown', confidence: bestScore };
  }

  return { templateId: bestId, confidence: bestScore };
}

export function resetEmbeddings(): void {
  templateEmbeddings = null;
}
