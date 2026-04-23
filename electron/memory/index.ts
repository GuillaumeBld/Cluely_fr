export { MemoryManager } from './MemoryManager';
export { runMigration, migrateLegacyIfNeeded } from './migration';
export { getCommitmentsInRange } from './DecisionQuery';
export { extractRelations } from './RelationExtractor';
export { ConflictDetector } from './ConflictDetector';
export type {
  NodeKind,
  EdgePredicate,
  MemoryNode,
  MemoryEdge,
  MemoryFact,
  PendingReview,
  PendingConflict,
  ConflictResolution,
} from './schema';
export type { CommitmentRow } from './DecisionQuery';
export type { TripleProposal, LLMFn } from './RelationExtractor';
export type { ConflictPair, ConflictDetectionResult, ExtractedTriple } from './ConflictDetector';
