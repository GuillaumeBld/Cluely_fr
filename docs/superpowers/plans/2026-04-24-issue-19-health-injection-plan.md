> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Implement the Pre-Meeting Health Injection pipeline: BackgroundAgent triggers HealthSnapshotFetcher 5 minutes before each calendar event → fetches project health data (HTTP or local script) → normalizes to markdown → writes to local KB corpus → meeting processor retrieves via RAG and cites in generated tasks. No UI surface.

**Architecture:** BackgroundAgent → HealthSnapshotFetcher → HealthSnapshot normalization → KBChunkWriter → Local-Corpus RAG store. Config-driven endpoint map per project.

**Tech Stack:** TypeScript · Node.js `fetch` · child_process (for local scripts) · SQLite or file-based KB store (matches #22 implementation)

---

### Task 1: Project health endpoint config

**Files:**
- Create `src/config/projectHealthEndpoints.json`
- Create `src/config/HealthEndpointConfig.ts`

- [ ] Step 1: Create `projectHealthEndpoints.json`:
  ```json
  {
    "finbiz": { "type": "http", "url": "https://status.finbiz.internal/api/health" },
    "qualiaai": { "type": "script", "path": "./scripts/qualiaai-health.sh" },
    "ev0": { "type": "http", "url": "https://ev0.internal/health" }
  }
  ```
- [ ] Step 2: Create `HealthEndpointConfig.ts` — loads and validates the JSON; exposes `getEndpoint(projectId: string): HealthEndpoint | null`.
- [ ] Step 3: Write test — `getEndpoint('qualiaai')` returns `{type: 'script', path: './scripts/qualiaai-health.sh'}`. `getEndpoint('unknown')` returns null.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(health): add project health endpoint config`

---

### Task 2: HealthSnapshotFetcher

**Files:**
- Create `src/services/HealthSnapshotFetcher.ts`
- Create `src/services/__tests__/HealthSnapshotFetcher.test.ts`

- [ ] Step 1: Write failing test — mocked HTTP endpoint returning `{status: 'degraded', alerts: ['API timeout on /v2/infer'], blockers: []}` → `fetchForProject('qualiaai')` returns a `HealthSnapshot` with `status='degraded'` and `alerts.length === 1`.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement HTTP fetch path:
  ```typescript
  async fetchHttp(url: string): Promise<HealthSnapshot> {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { status: data.status ?? 'unknown', alerts: data.alerts ?? [], blockers: data.blockers ?? [], rawPayload: data };
  }
  ```
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write failing test — script path returns exit code 0 with JSON stdout; assert `HealthSnapshot` populated.
- [ ] Step 6: Implement script exec path using `child_process.execFile` with 10s timeout; parse JSON stdout.
- [ ] Step 7: Run test — expect pass.
- [ ] Step 8: Write test — endpoint unreachable (fetch throws) → `fetchForProject` returns null, no exception.
- [ ] Step 9: Run test — expect pass.
- [ ] Step 10: Commit — `feat(health): implement HealthSnapshotFetcher for HTTP and script endpoints`

---

### Task 3: HealthSnapshot markdown serializer

**Files:**
- Create `src/services/HealthSnapshotSerializer.ts`
- Create `src/services/__tests__/HealthSnapshotSerializer.test.ts`

- [ ] Step 1: Write failing test — snapshot `{projectId: 'qualiaai', status: 'degraded', alerts: ['API timeout'], blockers: [], fetchedAt: '2026-04-21T09:55:00Z'}` serializes to markdown containing: `# QualiaAI Health — 2026-04-21T09:55:00Z`, `Status: degraded`, `- API timeout`.
- [ ] Step 2: Implement `serialize(snapshot: HealthSnapshot): string` — generates markdown with title, status, alerts list, blockers list.
- [ ] Step 3: Run test — expect pass.
- [ ] Step 4: Write test — empty alerts and blockers → lists are omitted from output (no empty `##` sections).
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Commit — `feat(health): add HealthSnapshotSerializer to markdown`

---

### Task 4: KBChunkWriter integration

**Files:**
- Create `src/services/KBChunkWriter.ts` (or extend existing KB ingestion service from #22)
- Create `src/services/__tests__/KBChunkWriter.test.ts`

- [ ] Step 1: Write failing test — `KBChunkWriter.writeChunk(text, {projectId, chunkType: 'health-snapshot', fetchedAt})` persists the chunk to the local corpus store; `queryChunks({projectId, chunkType: 'health-snapshot'})` returns it.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `KBChunkWriter.writeChunk()` — insert into the corpus SQLite table used by issue #22's RAG service. Include `stale` flag computed as `fetchedAt < now() - 2 hours`.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — chunk with `fetchedAt` 3 hours ago has `stale = 1`.
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Commit — `feat(kb): implement KBChunkWriter for health snapshot ingestion`

---

### Task 5: Wire into BackgroundAgent

**Files:**
- Modify `src/services/BackgroundAgent.ts`
- Modify `src/services/__tests__/BackgroundAgent.test.ts`

- [ ] Step 1: In `BackgroundAgent._runCycle()`, after calendar scan: for each upcoming event with a resolved `project_id`, call `HealthSnapshotFetcher.fetchForProject(project_id)`. If snapshot returned: serialize → `KBChunkWriter.writeChunk(...)`.
- [ ] Step 2: Write test — BackgroundAgent with mocked calendar (event in 4 min, project_id='qualiaai') + mocked fetcher returning a snapshot: assert `KBChunkWriter.writeChunk` called with markdown containing 'qualiaai'.
- [ ] Step 3: Run test — expect pass.
- [ ] Step 4: Write test — fetcher returns null (endpoint down): assert `KBChunkWriter.writeChunk` called with error summary markdown; no exception thrown.
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Commit — `feat(agent): integrate HealthSnapshotFetcher into BackgroundAgent pre-meeting cycle`

---

### Task 6: Integration test

**Files:**
- Create `src/__tests__/integration/healthInjection.test.ts`

- [ ] Step 1: Write integration test — mock calendar (event in 4 min, qualiaai), mock HTTP endpoint returning degraded status. Run `BackgroundAgent._runCycle()`. Assert: KB corpus contains a health-snapshot chunk for qualiaai with `status: degraded` in the markdown.
- [ ] Step 2: Run test — expect pass.
- [ ] Step 3: Write test — run the RAG retriever with query "qualiaai API performance": assert health-snapshot chunk is in top-3 results.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `test(health): add pre-meeting health injection integration test`
