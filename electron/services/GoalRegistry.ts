import crypto from 'crypto';
import Database from 'better-sqlite3';
import { Goal } from '../memory/schema';

/**
 * CRUD service for the goals table.
 * Supports embedding-based lookup via cosine similarity.
 */
export class GoalRegistry {
  private static instance: GoalRegistry | undefined;
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  public static getInstance(db: Database.Database): GoalRegistry {
    if (!GoalRegistry.instance) {
      GoalRegistry.instance = new GoalRegistry(db);
    }
    return GoalRegistry.instance;
  }

  public static resetInstance(): void {
    GoalRegistry.instance = undefined;
  }

  public create(goal: { name: string; description?: string; embedding?: Buffer }): Goal {
    const id = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO goals (id, title, description, embedding) VALUES (?, ?, ?, ?)`
    ).run(id, goal.name, goal.description ?? null, goal.embedding ?? null);
    return this.getById(id)!;
  }

  public list(): Goal[] {
    return this.db.prepare('SELECT * FROM goals ORDER BY created_at').all() as Goal[];
  }

  public getById(id: string): Goal | undefined {
    return this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Goal | undefined;
  }

  /**
   * Find the closest goal by cosine similarity to the given embedding.
   * Returns the best match with its similarity score, or undefined if no goals have embeddings.
   */
  public findByEmbedding(embedding: number[]): { goal: Goal; similarity: number } | undefined {
    const goals = this.db.prepare('SELECT * FROM goals WHERE embedding IS NOT NULL').all() as Goal[];
    if (goals.length === 0) return undefined;

    let best: { goal: Goal; similarity: number } | undefined;

    for (const goal of goals) {
      const goalEmbedding = deserializeEmbedding(goal.embedding!);
      const sim = cosineSimilarity(embedding, goalEmbedding);
      if (!best || sim > best.similarity) {
        best = { goal, similarity: sim };
      }
    }

    return best;
  }

  /**
   * Store an embedding for an existing goal.
   */
  public setEmbedding(id: string, embedding: number[]): void {
    this.db.prepare('UPDATE goals SET embedding = ? WHERE id = ?').run(
      serializeEmbedding(embedding),
      id,
    );
  }
}

/** Serialize a float64 array to a Buffer for SQLite BLOB storage. */
export function serializeEmbedding(embedding: number[]): Buffer {
  const buf = Buffer.alloc(embedding.length * 8);
  for (let i = 0; i < embedding.length; i++) {
    buf.writeDoubleLE(embedding[i], i * 8);
  }
  return buf;
}

/** Deserialize a Buffer back to a float64 array. */
export function deserializeEmbedding(buf: Buffer): number[] {
  const result: number[] = [];
  for (let i = 0; i < buf.length; i += 8) {
    result.push(buf.readDoubleLE(i));
  }
  return result;
}

/** Cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}
