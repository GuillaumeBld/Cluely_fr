import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import crypto from 'crypto';
import { runMigration } from './migration';
import {
  NodeKind,
  EdgePredicate,
  MemoryNode,
  MemoryEdge,
  MemoryFact,
  PendingReview,
} from './schema';

/** Confidence threshold — proposals below this go to pending_review instead of edges. */
const CONFIDENCE_GATE = 0.7;

/** Fact half-life in days — after this many days, confidence halves. */
const HALF_LIFE_DAYS = 30;

export class MemoryManager {
  private static instance: MemoryManager | null = null;
  private db: Database.Database;
  private _isDegraded = false;

  /** Returns true if MemoryManager fell back to an in-memory database. */
  public get isDegraded(): boolean { return this._isDegraded; }

  private constructor(dbOrPath?: Database.Database | string) {
    if (dbOrPath instanceof Database) {
      this.db = dbOrPath;
    } else {
      const dbPath = dbOrPath ?? path.join(app.getPath('userData'), 'memory.db');
      const dir = path.dirname(dbPath);
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(dbPath);
      } catch (err) {
        console.error('[MemoryManager] Failed to open memory.db, falling back to in-memory:', err);
        this.db = new Database(':memory:');
        this._isDegraded = true;
      }
    }
    runMigration(this.db);
  }

  public static getInstance(dbOrPath?: Database.Database | string): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager(dbOrPath);
    } else if (dbOrPath !== undefined) {
      console.warn('[MemoryManager] getInstance called with arguments but instance already exists -- arguments ignored.');
    }
    return MemoryManager.instance;
  }

  /** Reset singleton (for tests). */
  public static resetInstance(): void {
    MemoryManager.instance = null;
  }

  public getDb(): Database.Database {
    return this.db;
  }

  // ─── Nodes ───────────────────────────────────────────────────────

  public upsertNode(kind: NodeKind, label: string, metadata: Record<string, unknown> = {}): MemoryNode {
    const existing = this.db.prepare(
      'SELECT * FROM memory_nodes WHERE kind = ? AND label = ?'
    ).get(kind, label) as MemoryNode | undefined;

    if (existing) {
      this.db.prepare(
        "UPDATE memory_nodes SET metadata = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(JSON.stringify(metadata), existing.id);
      return this.db.prepare('SELECT * FROM memory_nodes WHERE id = ?').get(existing.id) as MemoryNode;
    }

    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO memory_nodes (id, kind, label, metadata) VALUES (?, ?, ?, ?)'
    ).run(id, kind, label, JSON.stringify(metadata));

    return this.db.prepare('SELECT * FROM memory_nodes WHERE id = ?').get(id) as MemoryNode;
  }

  public getNode(id: string): MemoryNode | undefined {
    return this.db.prepare('SELECT * FROM memory_nodes WHERE id = ?').get(id) as MemoryNode | undefined;
  }

  public findNodes(kind?: NodeKind, labelLike?: string): MemoryNode[] {
    let sql = 'SELECT * FROM memory_nodes WHERE 1=1';
    const params: unknown[] = [];

    if (kind) {
      sql += ' AND kind = ?';
      params.push(kind);
    }
    if (labelLike) {
      sql += ' AND label LIKE ?';
      params.push(`%${labelLike}%`);
    }

    return this.db.prepare(sql).all(...params) as MemoryNode[];
  }

  // ─── Edges (confidence-gated) ────────────────────────────────────

  /**
   * Propose an edge. If confidence >= CONFIDENCE_GATE it becomes a real edge;
   * otherwise it goes to pending_review.
   */
  public proposeEdge(
    sourceId: string,
    targetId: string,
    predicate: EdgePredicate,
    confidence: number,
    meetingId: string | null = null,
    context: string = '',
    metadata: Record<string, unknown> = {},
  ): { stored: 'edge' | 'pending'; id: number } {
    if (confidence >= CONFIDENCE_GATE) {
      const info = this.db.prepare(
        `INSERT INTO memory_edges (source_id, target_id, predicate, weight, metadata, meeting_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(sourceId, targetId, predicate, confidence, JSON.stringify(metadata), meetingId);
      return { stored: 'edge', id: Number(info.lastInsertRowid) };
    }

    const info = this.db.prepare(
      `INSERT INTO pending_review (source_id, target_id, predicate, confidence, context, meeting_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(sourceId, targetId, predicate, confidence, context, meetingId);
    return { stored: 'pending', id: Number(info.lastInsertRowid) };
  }

  public getEdgesFrom(nodeId: string): MemoryEdge[] {
    return this.db.prepare(
      'SELECT * FROM memory_edges WHERE source_id = ?'
    ).all(nodeId) as MemoryEdge[];
  }

  public getEdgesTo(nodeId: string): MemoryEdge[] {
    return this.db.prepare(
      'SELECT * FROM memory_edges WHERE target_id = ?'
    ).all(nodeId) as MemoryEdge[];
  }

  // ─── Facts ───────────────────────────────────────────────────────

  public upsertFact(
    nodeId: string,
    key: string,
    value: string,
    confidence: number = 1.0,
    source: string = '',
  ): MemoryFact {
    const existing = this.db.prepare(
      'SELECT * FROM memory_facts WHERE node_id = ? AND key = ?'
    ).get(nodeId, key) as MemoryFact | undefined;

    if (existing) {
      this.db.prepare(
        "UPDATE memory_facts SET value = ?, confidence = ?, source = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(value, confidence, source, existing.id);
      return this.db.prepare('SELECT * FROM memory_facts WHERE id = ?').get(existing.id) as MemoryFact;
    }

    const info = this.db.prepare(
      'INSERT INTO memory_facts (node_id, key, value, confidence, source) VALUES (?, ?, ?, ?, ?)'
    ).run(nodeId, key, value, confidence, source);

    return this.db.prepare('SELECT * FROM memory_facts WHERE id = ?').get(Number(info.lastInsertRowid)) as MemoryFact;
  }

  public getFacts(nodeId: string): MemoryFact[] {
    return this.db.prepare(
      'SELECT * FROM memory_facts WHERE node_id = ?'
    ).all(nodeId) as MemoryFact[];
  }

  // ─── Confidence Decay ────────────────────────────────────────────

  /**
   * Apply exponential decay to all fact confidences based on time since last update.
   * Formula: new_confidence = confidence * 2^(−days_since_update / HALF_LIFE_DAYS)
   */
  public decayFacts(): number {
    const facts = this.db.prepare('SELECT id, confidence, updated_at FROM memory_facts').all() as {
      id: number;
      confidence: number;
      updated_at: string;
    }[];

    const now = Date.now();
    let updated = 0;

    const updateStmt = this.db.prepare(
      'UPDATE memory_facts SET confidence = ? WHERE id = ?'
    );

    this.db.transaction(() => {
      for (const fact of facts) {
        const updatedAt = new Date(fact.updated_at + 'Z').getTime(); // SQLite datetimes are UTC
        if (isNaN(updatedAt)) {
          console.warn('[MemoryManager] Skipping fact with invalid updated_at:', fact.id, fact.updated_at);
          continue;
        }
        const daysSinceUpdate = (now - updatedAt) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate <= 0) continue;

        const decayed = fact.confidence * Math.pow(2, -daysSinceUpdate / HALF_LIFE_DAYS);
        updateStmt.run(decayed, fact.id);
        updated++;
      }
    })();

    return updated;
  }

  // ─── Pending Review ──────────────────────────────────────────────

  public getPendingReview(): PendingReview[] {
    return this.db.prepare(
      "SELECT * FROM pending_review WHERE status = 'pending' ORDER BY created_at DESC"
    ).all() as PendingReview[];
  }

  public resolveReview(id: number, approved: boolean): { resolved: boolean } {
    const status = approved ? 'approved' : 'rejected';
    const info = this.db.prepare(
      "UPDATE pending_review SET status = ?, resolved_at = datetime('now') WHERE id = ? AND status = 'pending'"
    ).run(status, id);

    if (info.changes === 0) return { resolved: false };

    if (approved) {
      const review = this.db.prepare('SELECT * FROM pending_review WHERE id = ?').get(id) as PendingReview;
      if (review) {
        this.db.prepare(
          `INSERT INTO memory_edges (source_id, target_id, predicate, weight, meeting_id)
           VALUES (?, ?, ?, ?, ?)`
        ).run(review.source_id, review.target_id, review.predicate, review.confidence, review.meeting_id);
      }
    }
    return { resolved: true };
  }
}
