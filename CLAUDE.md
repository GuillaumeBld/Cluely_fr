# CLAUDE.md

## Development

### Testing
- Test runner: **vitest** (v4)
- Run tests: `npx vitest` or `npx vitest run`
- Electron module is mocked via alias in `vitest.config.ts` -> `test/__mocks__/electron.ts`
- Tests live in `test/` mirroring `electron/` and `src/` structure

### Architecture Notes
- Electron main process code lives in `electron/` (not `src/main/`)
- `electron/main.ts` -- AppState singleton is the service registry
- `electron/memory/` -- SQLite graph store (memory.db) for relationship/fact tracking
- `electron/config/` -- agent configuration (agentConfig)
- `electron/services/` -- mid-call decision capture layer (IpcEventBus, LunrIndexer, SlidingWindowAnalyzer, TaskGeneratorBuffer, MemoryGraphWriter) and background agent (BackgroundAgent, AgentStateManager, CommitmentStalenessChecker, PermissionsAuditLog)
- `electron/corpus/` -- local-corpus RAG: file + git-history indexing, embedding-based retrieval, freshness guard
  - Config: `corpus.json` in Electron userData directory (no UI; file-based only)
- `src/services/` -- post-meeting pipeline (RecapLLM, WorkflowClassifier, WorkflowDrafter, PostMeetingProcessor, ArchonDispatcher)
- `src/components/` -- approval UI (ApprovalTray, WorkflowCard) for gated workflow execution
- `src/ipc/approvalHandlers.ts` -- IPC bridge for approval/reject/dispatch actions
- `src/data/workflowTemplates.json` -- static workflow template definitions loaded at startup
