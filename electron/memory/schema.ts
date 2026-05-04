// Memory graph DDL — nodes, edges, facts, pending_review
// Uses better-sqlite3, same as DatabaseManager

/**
 * Node kinds allowed in the memory graph.
 * Add new kinds here — RelationExtractor.ts picks them up automatically via NODE_KINDS.
 */
export const NODE_KINDS = [
  'person', 'topic', 'organization', 'project', 'meeting', 'decision', 'goal', 'commitment',
] as const;

export type NodeKind = typeof NODE_KINDS[number];

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
  | 'decided'
  | 'reports_to'
  | 'blocked_by'
  | 'contradicts'
  | 'prefers';

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

export interface DispatchMacro {
  id: number;
  project_id: string;
  meeting_type: string;
  template_id: string;
  prior_context_count: number;
  dispatch_target: string;
  active: number;          // 0 | 1
  created_at: string;
}

/** Fact half-life in days — after this many days, confidence halves. */
export const HALF_LIFE_DAYS = 30;

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

export const DDL_DISPATCH_MACROS = `
CREATE TABLE IF NOT EXISTS dispatch_macros (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          TEXT NOT NULL,
  meeting_type        TEXT NOT NULL,
  template_id         TEXT NOT NULL,
  prior_context_count INTEGER DEFAULT 3,
  dispatch_target     TEXT NOT NULL,
  active              INTEGER DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, meeting_type)
);
`;

export const DDL_SCHEMA_VERSION = `
CREATE TABLE IF NOT EXISTS memory_schema_version (
  version INTEGER NOT NULL
);
`;

export const DDL_PENDING_CONFLICTS = `
CREATE TABLE IF NOT EXISTS pending_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  relation TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  speaker TEXT,
  timestamp TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
`;

export const DDL_CONFLICT_RESOLUTIONS = `
CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conflict_id INTEGER,
  node_id TEXT,
  fact_key TEXT,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'update',
  meeting_id TEXT,
  resolved_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export interface PendingConflict {
  id: number;
  meeting_id: string;
  entity: string;
  relation: string;
  old_value: string;
  new_value: string;
  speaker: string | null;
  timestamp: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ConflictResolution {
  id: number;
  conflict_id: number | null;
  node_id: string | null;
  fact_key: string | null;
  old_value: string;
  new_value: string;
  action: string;
  meeting_id: string | null;
  resolved_at: string;
}

export const DDL_DECISIONS = `
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  goal_id TEXT REFERENCES goals(id),
  conflict_resolved INTEGER NOT NULL DEFAULT 0,
  source_edge_id INTEGER,
  dispatched_job_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(meeting_id, text_hash)
);
`;

export const DDL_DECISIONS_GOAL_INDEX = `
CREATE INDEX IF NOT EXISTS idx_decisions_goal ON decisions(goal_id);
`;

export const DDL_DECISIONS_MEETING_INDEX = `
CREATE INDEX IF NOT EXISTS idx_decisions_meeting ON decisions(meeting_id);
`;

// 768 = output dimension of the embedding model used by EmbeddingPipeline (gemini-embedding-001).
// Update this if the model changes (schema migration required for existing databases).
export const DDL_FACTS_VEC = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_facts_vec USING vec0(
  fact_id INTEGER PRIMARY KEY,
  embedding float[768] distance_metric=cosine
);
`;

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  embedding: Buffer | null;
  parent_id: string | null;
  created_at: number;
  completed_at: number | null;
}

export interface Decision {
  id: number;
  meeting_id: string;
  timestamp: string;
  speaker: string;
  text: string;
  text_hash: string;
  goal_id: string | null;
  conflict_resolved: number;
  source_edge_id: number | null;
  dispatched_job_id: string | null;
  created_at: string;
}

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
  DDL_DISPATCH_MACROS,
  DDL_SCHEMA_VERSION,
  DDL_PENDING_CONFLICTS,
  DDL_CONFLICT_RESOLUTIONS,
  DDL_DECISIONS,
  DDL_DECISIONS_GOAL_INDEX,
  DDL_DECISIONS_MEETING_INDEX,
] as const;

/** DDL that requires sqlite-vec extension to be loaded. Run separately after ALL_DDL. */
export const VEC_DDL = [
  DDL_FACTS_VEC,
] as const;
