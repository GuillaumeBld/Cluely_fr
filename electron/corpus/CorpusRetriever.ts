// electron/corpus/CorpusRetriever.ts
// Retrieves top-K corpus chunks via cosine similarity

import Database from 'better-sqlite3';
import { EmbeddingProvider } from './CorpusIndexer';

export interface CorpusChunk {
  id: string;
  project_id: string;
  source_path: string;
  chunk_text: string;
  commit_hash: string | null;
  score: number;
}

function blobToEmbedding(blob: Buffer): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < blob.length; i += 4) {
    embedding.push(blob.readFloatLE(i));
  }
  return embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export class CorpusRetriever {
  private db: Database.Database;
  private embedder: EmbeddingProvider;

  constructor(db: Database.Database, embedder: EmbeddingProvider) {
    this.db = db;
    this.embedder = embedder;
  }

  async query(queryText: string, projectId: string, k: number = 5): Promise<CorpusChunk[]> {
    const qEmbed = await this.embedder.getEmbedding(queryText);

    const rows = this.db.prepare(
      'SELECT * FROM corpus_chunks WHERE project_id = ? AND embedding IS NOT NULL'
    ).all(projectId) as any[];

    const scored: CorpusChunk[] = [];

    for (const row of rows) {
      const chunkEmbedding = blobToEmbedding(row.embedding);
      const score = cosineSimilarity(qEmbed, chunkEmbedding);

      scored.push({
        id: row.id,
        project_id: row.project_id,
        source_path: row.source_path,
        chunk_text: row.chunk_text,
        commit_hash: row.commit_hash,
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
