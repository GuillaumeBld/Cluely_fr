import Database from 'better-sqlite3';
import { EmbeddingPipeline } from '../rag/EmbeddingPipeline';

export interface TaggedActionItem {
  text: string;
  goal_id: string | null;
  goal_confidence: number | null;
}

interface GoalRow {
  id: string;
  title: string;
  embedding: Buffer | null;
}

const GOAL_CONFIDENCE_THRESHOLD = 0.65;

/**
 * Cosine similarity between two vectors.
 * Returns 0 if either vector is zero-length.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Decode a Float32Array stored as a BLOB back to number[].
 */
function decodeBlobToVector(buf: Buffer): number[] {
  const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(floats);
}

export class GoalAligner {
  constructor(
    private db: Database.Database,
    private embeddingPipeline: EmbeddingPipeline,
  ) {}

  async alignActionItems(items: string[], _meetingId: string): Promise<TaggedActionItem[]> {
    const goals = this.db.prepare(
      'SELECT id, title, embedding FROM goals WHERE completed_at IS NULL AND embedding IS NOT NULL'
    ).all() as GoalRow[];

    if (goals.length === 0) {
      return items.map((text): TaggedActionItem => ({ text, goal_id: null, goal_confidence: null }));
    }

    // Decode all goal embeddings once
    const goalVectors = goals.map(g => ({
      id: g.id,
      vec: decodeBlobToVector(g.embedding!),
    }));

    return Promise.all(items.map(async (text) => {
      const itemEmbedding = await this.embeddingPipeline.getEmbedding(text);

      let bestId: string | null = null;
      let bestScore = -1;

      for (const goal of goalVectors) {
        const score = cosineSimilarity(itemEmbedding, goal.vec);
        if (score > bestScore) {
          bestScore = score;
          bestId = goal.id;
        }
      }

      if (bestScore >= GOAL_CONFIDENCE_THRESHOLD && bestId) {
        return { text, goal_id: bestId, goal_confidence: bestScore };
      }
      return { text, goal_id: null, goal_confidence: null };
    }));
  }
}

// Re-export for convenience
export { cosineSimilarity, decodeBlobToVector };
