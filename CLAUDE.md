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
  - `MemoryManager.ts` -- singleton DB wrapper; upsertNode/proposeEdge/decayFacts/storeFactEmbedding/findSimilar; falls back to `:memory:` on file error
  - `schema.ts` -- DDL (ALL_DDL + VEC_DDL), NODE_KINDS const (single source of truth for node kind enumerations), type definitions; VEC_DDL runs outside main migration transaction
  - `migration.ts` -- idempotent DDL runner; called from MemoryManager constructor; vec DDL (VEC_DDL) runs outside main transaction so test isolation is preserved
  - `vecLoader.ts` -- loads sqlite-vec extension into a DB connection; dev uses npm loader, prod resolves asar-unpacked binary; never throws
  - `RelationExtractor.ts` -- LLM-based triple extraction; uses NODE_KINDS to stay in sync with schema
  - `GoalAligner.ts` -- embedding cosine-similarity alignment of action items to goals
  - `GoalHintBuilder.ts` -- pre-call hint builder; wraps DatabaseManager.getOpenActionItemsByGoal
  - `DecisionQuery.ts` -- structured query for commitment/decision edges within a date range
- `electron/ipcHandlers.ts` -- main IPC handler registrations (goal:create, goal:list, goal:complete, goal:pre-call-hint, and many more)
- `electron/ipc/memoryHandlers.ts` -- memory-specific IPC handlers (memory:find-similar, memory:embed-fact, memory:resolve-review, and others)
- `electron/preload.ts` -- exposes `window.electronAPI` bindings to the renderer
- `electron/config/` -- agent configuration (agentConfig)
- `electron/services/` -- mid-call decision capture layer (IpcEventBus, LunrIndexer, SlidingWindowAnalyzer, TaskGeneratorBuffer, MemoryGraphWriter) and background agent (BackgroundAgent, AgentStateManager, CommitmentStalenessChecker, PermissionsAuditLog)
- `electron/corpus/` -- local-corpus RAG: file + git-history indexing, embedding-based retrieval, freshness guard
  - Config: `corpus.json` in Electron userData directory (no UI; file-based only)
- `src/services/` -- post-meeting pipeline (RecapLLM, WorkflowClassifier, WorkflowDrafter, PostMeetingProcessor, ArchonDispatcher)
- `src/components/` -- approval UI (ApprovalTray, WorkflowCard) for gated workflow execution
- `src/ipc/approvalHandlers.ts` -- IPC bridge for approval/reject/dispatch actions
- `src/data/workflowTemplates.json` -- static workflow template definitions loaded at startup
