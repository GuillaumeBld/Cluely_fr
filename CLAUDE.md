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
- `electron/config/` -- agent configuration (agentConfig) and health endpoint configuration
  - `projectHealthEndpoints.json`: maps project IDs to HTTP health URLs (no UI; edit file directly)
- `electron/ipc/` -- modular IPC handler modules (e.g. `dashboardHandlers.ts`); each exports a `register*Handlers` function wired in `ipcHandlers.ts`
- `electron/services/` -- service layer, three groups:
  - *Mid-call capture*: IpcEventBus, LunrIndexer, SlidingWindowAnalyzer, TaskGeneratorBuffer, MemoryGraphWriter
  - *Background agent*: BackgroundAgent, AgentStateManager, CommitmentStalenessChecker, PermissionsAuditLog
  - *Dispatch dashboard*: DashboardPoller (polls health endpoints every 5 min), HealthChunkWriter (SQLite persistence), HealthSnapshotFetcher, HealthSnapshotSerializer
- `electron/corpus/` -- local-corpus RAG: file + git-history indexing, embedding-based retrieval, freshness guard
  - Config: `corpus.json` in Electron userData directory (no UI; file-based only)
- `src/services/` -- post-meeting pipeline (RecapLLM, WorkflowClassifier, WorkflowDrafter, PostMeetingProcessor, ArchonDispatcher)
- `src/components/` -- UI panels: approval UI (ApprovalTray, WorkflowCard) for gated workflow execution; dispatch dashboard (DispatchDashboard) for multi-project health monitoring
- `src/ipc/approvalHandlers.ts` -- IPC bridge for approval/reject/dispatch actions
- `src/data/workflowTemplates.json` -- static workflow template definitions loaded at startup
