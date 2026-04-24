# CLAUDE.md

## Development

### Testing
- Test runner: **vitest** (v2, configured for Vite 5 compatibility)
- Run tests: `npx vitest` or `npx vitest run`
- Electron module is mocked via alias in `vitest.config.ts` -> `test/__mocks__/electron.ts`
- Tests live in `test/` mirroring `electron/` structure

### Architecture Notes
- Electron main process code lives in `electron/` (not `src/main/`)
- `electron/main.ts` -- AppState singleton is the service registry
- `electron/memory/` -- SQLite graph store (memory.db) for relationship/fact tracking
- `electron/services/` -- Domain services (pre-meeting orchestrator, calendar, email, zoom)
