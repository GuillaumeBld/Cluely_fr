// electron/corpus/CorpusIndexer.ts
// Indexes project files and git history into corpus_chunks table

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { minimatch } from 'minimatch';
import { CorpusProjectConfig } from './corpus.config';

export interface EmbeddingProvider {
  getEmbedding(text: string): Promise<number[]>;
}

const TARGET_CHUNK_TOKENS = 200;
const MAX_CHUNK_TOKENS = 300;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function chunkId(projectId: string, sourcePath: string, chunkIndex: number): string {
  return createHash('sha256')
    .update(`${projectId}:${sourcePath}:${chunkIndex}`)
    .digest('hex')
    .slice(0, 32);
}

function embeddingToBlob(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

export function chunkText(text: string, maxTokens: number = TARGET_CHUNK_TOKENS): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line);

    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(line);
    currentTokens += lineTokens;

    // Force split if single line exceeds max
    if (currentTokens > MAX_CHUNK_TOKENS && currentChunk.length === 1) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [];
      currentTokens = 0;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
}

function shouldIncludeFile(
  filePath: string,
  rootPath: string,
  includeGlobs: string[],
  excludeGlobs: string[]
): boolean {
  const relativePath = path.relative(rootPath, filePath);

  const excluded = excludeGlobs.some(g => minimatch(relativePath, g));
  if (excluded) return false;

  const included = includeGlobs.some(g => minimatch(relativePath, g));
  return included;
}

export class CorpusIndexer {
  private db: Database.Database;
  private embedder: EmbeddingProvider | null;

  constructor(db: Database.Database, embedder: EmbeddingProvider | null = null) {
    this.db = db;
    this.embedder = embedder;
  }

  async indexFile(projectId: string, filePath: string, commitHash: string | null): Promise<number> {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      console.warn(`[CorpusIndexer] Cannot read file: ${filePath}`);
      return 0;
    }

    // Skip binary / very large files
    if (content.length > 500_000) {
      console.log(`[CorpusIndexer] Skipping large file: ${filePath}`);
      return 0;
    }

    const chunks = chunkText(content);
    const now = Date.now();

    const upsert = this.db.prepare(`
      INSERT OR REPLACE INTO corpus_chunks (id, project_id, source_path, chunk_text, embedding, commit_hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertAll = this.db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const id = chunkId(projectId, filePath, i);
        upsert.run(id, projectId, filePath, chunks[i], null, commitHash, now);
      }
    });
    upsertAll();

    // Embed asynchronously if embedder available
    if (this.embedder) {
      for (let i = 0; i < chunks.length; i++) {
        try {
          const embedding = await this.embedder.getEmbedding(chunks[i]);
          const id = chunkId(projectId, filePath, i);
          this.db.prepare('UPDATE corpus_chunks SET embedding = ? WHERE id = ?')
            .run(embeddingToBlob(embedding), id);
        } catch (err) {
          console.warn(`[CorpusIndexer] Embedding failed for chunk ${i} of ${filePath}:`, err);
        }
      }
    }

    return chunks.length;
  }

  indexCommits(projectId: string, repoPath: string, cap: number): number {
    let log: string;
    try {
      log = execSync(
        `git -C "${repoPath}" log --format="%H%n%s%n%b%n---END---" -n ${cap}`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
    } catch {
      console.warn(`[CorpusIndexer] Failed to read git log for ${repoPath}`);
      return 0;
    }

    const entries = log.split('---END---\n').filter(e => e.trim());
    const now = Date.now();

    const upsert = this.db.prepare(`
      INSERT OR REPLACE INTO corpus_chunks (id, project_id, source_path, chunk_text, embedding, commit_hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertAll = this.db.transaction(() => {
      for (const entry of entries) {
        const lines = entry.trim().split('\n');
        const hash = lines[0];
        const message = lines.slice(1).join('\n').trim();
        if (!hash || !message) continue;

        const id = chunkId(projectId, `git:${hash}`, 0);
        upsert.run(id, projectId, `git:commit`, message, null, hash, now);
      }
    });
    upsertAll();

    return entries.length;
  }

  async incrementalIndex(config: CorpusProjectConfig): Promise<number> {
    const { projectId, rootPath, includeGlobs, excludeGlobs, commitCap } = config;

    // Find last indexed timestamp for this project
    const row = this.db.prepare(
      'SELECT MAX(indexed_at) as last FROM corpus_chunks WHERE project_id = ?'
    ).get(projectId) as { last: number | null } | undefined;
    const lastIndexedAt = row?.last ?? 0;

    let totalChunks = 0;

    // Index changed files since last index
    const filesToIndex = this.findChangedFiles(rootPath, lastIndexedAt, includeGlobs, excludeGlobs);
    for (const filePath of filesToIndex) {
      totalChunks += await this.indexFile(projectId, filePath, null);
    }

    // Index recent commits
    totalChunks += this.indexCommits(projectId, rootPath, commitCap);

    console.log(`[CorpusIndexer] Indexed ${totalChunks} chunks for project ${projectId}`);
    return totalChunks;
  }

  private findChangedFiles(
    rootPath: string,
    sinceMs: number,
    includeGlobs: string[],
    excludeGlobs: string[]
  ): string[] {
    const files: string[] = [];

    function walk(dir: string) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories early
          const relDir = path.relative(rootPath, fullPath);
          if (excludeGlobs.some(g => minimatch(relDir + '/', g) || minimatch(relDir, g))) {
            continue;
          }
          walk(fullPath);
        } else if (entry.isFile()) {
          if (!shouldIncludeFile(fullPath, rootPath, includeGlobs, excludeGlobs)) {
            continue;
          }

          try {
            const stats = fs.statSync(fullPath);
            if (stats.mtimeMs > sinceMs) {
              files.push(fullPath);
            }
          } catch {
            // Skip inaccessible files
          }
        }
      }
    }

    walk(rootPath);
    return files;
  }
}
