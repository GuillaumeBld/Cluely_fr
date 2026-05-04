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
- `electron/ipcHandlers.ts` -- all IPC handler registrations (goal:create, goal:list, goal:complete, goal:pre-call-hint, ws:set-port, and many more)
- `electron/preload.ts` -- exposes `window.electronAPI` bindings to the renderer
- `electron/config/` -- agent configuration (`agentConfig`); WebSocket port config (`wsConfig.ts` — default port 8765, range 1024–65535, runtime-mutable via `ws:set-port` IPC)
- `electron/services/` -- mid-call decision capture layer (IpcEventBus, LunrIndexer, SlidingWindowAnalyzer, TaskGeneratorBuffer, MemoryGraphWriter) and background agent (BackgroundAgent, AgentStateManager, CommitmentStalenessChecker, PermissionsAuditLog); real-time broadcast layer (WebSocketEmitter — forwards IpcEventBus events to WebSocket clients on configurable port)
- `electron/corpus/` -- local-corpus RAG: file + git-history indexing, embedding-based retrieval, freshness guard
  - Config: `corpus.json` in Electron userData directory (no UI; file-based only)
- `src/services/` -- post-meeting pipeline (RecapLLM, WorkflowClassifier, WorkflowDrafter, PostMeetingProcessor, ArchonDispatcher)
- `src/components/` -- approval UI (ApprovalTray, WorkflowCard) for gated workflow execution
- `src/ipc/approvalHandlers.ts` -- IPC bridge for approval/reject/dispatch actions
- `src/data/workflowTemplates.json` -- static workflow template definitions loaded at startup
