export { MemoryManager } from './MemoryManager';
export { runMigration, migrateLegacyIfNeeded } from './migration';
export { getCommitmentsInRange } from './DecisionQuery';
export { extractRelations } from './RelationExtractor';
export type {
  NodeKind,
  EdgePredicate,
  MemoryNode,
  MemoryEdge,
  MemoryFact,
  PendingReview,
} from './schema';
export type { CommitmentRow } from './DecisionQuery';
export type { TripleProposal, LLMFn } from './RelationExtractor';
