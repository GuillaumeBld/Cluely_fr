# CLAUDE.md

## Development

### Testing
- Test runner: **vitest** (v4, upgraded from v2; jsdom and @testing-library/react are available for component tests)
- Run tests: `npx vitest` or `npx vitest run`
- Electron module is mocked via alias in `vitest.config.ts` -> `test/__mocks__/electron.ts`
- Tests live in `test/` mirroring `electron/` and `src/` structure

### Architecture Notes
- Electron main process code lives in `electron/` (not `src/main/`)
- `electron/main.ts` -- AppState singleton is the service registry
- `electron/memory/` -- SQLite graph store (memory.db) for relationship/fact tracking
  - `MemoryManager.ts` -- singleton DB wrapper; upsertNode/proposeEdge/decayFacts; falls back to `:memory:` on file error
  - `schema.ts` -- DDL, NODE_KINDS const (single source of truth for node kind enumerations), type definitions
  - `migration.ts` -- idempotent DDL runner; called from MemoryManager constructor
  - `RelationExtractor.ts` -- LLM-based triple extraction; uses NODE_KINDS to stay in sync with schema
  - `GoalAligner.ts` -- embedding cosine-similarity alignment of action items to goals
  - `GoalHintBuilder.ts` -- pre-call hint builder; wraps DatabaseManager.getOpenActionItemsByGoal
  - `DecisionQuery.ts` -- structured query for commitment/decision edges within a date range
- `electron/ipcHandlers.ts` -- most IPC handler registrations (goal:create, goal:list, goal:complete, goal:pre-call-hint, and many more); service-startup handlers (background-agent:*, hermes:set-enabled, hermes:set-sensitivity, hermes:set-interval, hermes:get-settings) are registered in `electron/main.ts`
- `electron/preload.ts` -- exposes `window.electronAPI` bindings to the renderer
- `electron/config/` -- agent configuration (agentConfig)
- `electron/services/` -- mid-call decision capture layer (IpcEventBus, LunrIndexer, SlidingWindowAnalyzer, TaskGeneratorBuffer, MemoryGraphWriter) and background agents (BackgroundAgent, AgentStateManager, CommitmentStalenessChecker, PermissionsAuditLog, HermesObserver, HermesDrafter)
  - `HermesObserver.ts` -- cross-session pattern detector; polls SQLite on a configurable interval; detects recurring blockers, goal drift, contradictions; broadcasts `approval:drafts-ready`
  - `HermesDrafter.ts` -- LLM drafter for `HermesPattern` → `WorkflowDraft` with `source:'hermes-pattern'`
- `electron/services/CredentialsManager.ts` -- persisted credentials and per-service runtime config (BackgroundAgentConfig, HermesObserverConfig); new services should add a typed config interface and DEFAULT_* constant here
- `electron/corpus/` -- local-corpus RAG: file + git-history indexing, embedding-based retrieval, freshness guard
  - Config: `corpus.json` in Electron userData directory (no UI; file-based only)
- `src/services/` -- post-meeting pipeline (RecapLLM, WorkflowClassifier, WorkflowDrafter, PostMeetingProcessor, ArchonDispatcher)
- `src/components/` -- approval UI (ApprovalTray, WorkflowCard) for gated workflow execution
- `src/ipc/approvalHandlers.ts` -- IPC bridge for approval/reject/dispatch actions
- `src/data/workflowTemplates.json` -- static workflow template definitions loaded at startup
