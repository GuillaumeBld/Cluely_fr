import { GoalRegistry, cosineSimilarity } from './GoalRegistry';

/** Similarity threshold — below this, no goal is assigned. */
const SIMILARITY_THRESHOLD = 0.65;

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/**
 * Aligns decision text to the closest goal via embedding similarity.
 * Returns goal_id if similarity >= threshold, otherwise null (no exception).
 */
export class GoalAligner {
  private static instance: GoalAligner | undefined;
  private registry: GoalRegistry;
  private embedder: EmbeddingProvider;

  private constructor(registry: GoalRegistry, embedder: EmbeddingProvider) {
    this.registry = registry;
    this.embedder = embedder;
  }

  public static getInstance(registry: GoalRegistry, embedder: EmbeddingProvider): GoalAligner {
    if (!GoalAligner.instance) {
      GoalAligner.instance = new GoalAligner(registry, embedder);
    }
    return GoalAligner.instance;
  }

  public static resetInstance(): void {
    GoalAligner.instance = undefined;
  }

  /**
   * Align text to the closest goal.
   * Returns goal_id if above threshold, null otherwise. Never throws.
   */
  public async align(text: string): Promise<number | null> {
    try {
      const embedding = await this.embedder.embed(text);
      const result = this.registry.findByEmbedding(embedding);
      if (!result || result.similarity < SIMILARITY_THRESHOLD) {
        return null;
      }
      return result.goal.id;
    } catch {
      return null;
    }
  }
}
