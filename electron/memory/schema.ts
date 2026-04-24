// Memory graph DDL — nodes, edges, facts, pending_review
// Uses better-sqlite3, same as DatabaseManager

/**
 * Node kinds allowed in the memory graph.
 * Extensible: add new literal members as needed.
 */
export type NodeKind = 'person' | 'topic' | 'organization' | 'project' | 'meeting' | 'decision' | 'goal';

/**
 * Predicate labels for typed edges between nodes.
 */
export type EdgePredicate =
  | 'knows'
  | 'works_on'
  | 'belongs_to'
  | 'agreed_with'
  | 'owes'
  | 'discussed'
  | 'decided';

export interface MemoryNode {
  id: string;          // UUID
  kind: NodeKind;
  label: string;       // human-readable name
  metadata: string;    // JSON blob for extra attributes
  created_at: string;  // ISO-8601
  updated_at: string;  // ISO-8601
}

export interface MemoryEdge {
  id: number;
  source_id: string;   // FK → nodes.id
  target_id: string;   // FK → nodes.id
  predicate: EdgePredicate;
  weight: number;       // confidence 0..1
  metadata: string;     // JSON blob
  meeting_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryFact {
  id: number;
  node_id: string;      // FK → nodes.id
  key: string;          // e.g. "email", "role", "preference"
  value: string;
  confidence: number;   // 0..1
  source: string;       // e.g. "transcript:meeting-123"
  embedding: Buffer | null;
  created_at: string;
  updated_at: string;
}

export interface PendingReview {
  id: number;
  source_id: string;
  target_id: string;
  predicate: string;
  confidence: number;
  context: string;      // snippet that triggered the proposal
  meeting_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at: string | null;
}

// ─── DDL statements ────────────────────────────────────────────────

export const SCHEMA_VERSION = 1;

export const DDL_NODES = `
CREATE TABLE IF NOT EXISTS memory_nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const DDL_EDGES = `
CREATE TABLE IF NOT EXISTS memory_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  predicate TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  metadata TEXT NOT NULL DEFAULT '{}',
  meeting_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const DDL_EDGES_INDEX = `
CREATE INDEX IF NOT EXISTS idx_edges_source ON memory_edges(source_id);
`;

export const DDL_EDGES_TARGET_INDEX = `
CREATE INDEX IF NOT EXISTS idx_edges_target ON memory_edges(target_id);
`;

export const DDL_FACTS = `
CREATE TABLE IF NOT EXISTS memory_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT '',
  embedding BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const DDL_FACTS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_facts_node ON memory_facts(node_id);
`;

export const DDL_PENDING_REVIEW = `
CREATE TABLE IF NOT EXISTS pending_review (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  context TEXT NOT NULL DEFAULT '',
  meeting_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
`;

export const DDL_GOALS = `
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  embedding BLOB,
  parent_id TEXT REFERENCES goals(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);
`;

export const DDL_GOALS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_id);
`;

export const DDL_SCHEMA_VERSION = `
CREATE TABLE IF NOT EXISTS memory_schema_version (
  version INTEGER NOT NULL
);
`;

export const ALL_DDL = [
  DDL_NODES,
  DDL_EDGES,
  DDL_EDGES_INDEX,
  DDL_EDGES_TARGET_INDEX,
  DDL_FACTS,
  DDL_FACTS_INDEX,
  DDL_PENDING_REVIEW,
  DDL_GOALS,
  DDL_GOALS_INDEX,
  DDL_SCHEMA_VERSION,
] as const;
