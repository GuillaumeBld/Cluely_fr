# Pre-Meeting Project Health Injection (reshaped from #19)

## Problem & goal

Project health signals (recent alerts, open blockers, deployment status) exist in external systems but are never surfaced to the meeting processor. When Guillaume discusses a project in a meeting, the LLM generating tasks has no knowledge of whether there is a live incident, a recent deployment, or a known blocker — leading to tasks that ignore the current project state. This feature auto-fetches health snapshots for calendar-matched projects 5 minutes before each meeting and injects them as KB context chunks, so the meeting processor can cite them when generating tasks.

The original issue (#19) was a human-facing ops dashboard. This reshape eliminates all UI surface and makes health data machine-consumable only, in line with the pipeline automation goal.

## User story

A meeting about QualiaAI starts. Unknown to Guillaume, an API endpoint was degraded overnight. The background agent fetched a health snapshot 5 minutes earlier, found the alert, and injected it as a KB context chunk. When the meeting ends and the task generator runs, it produces: "Investigate QualiaAI API degradation [KB: health-snapshot-2026-04-21T09:55Z]" — a task Guillaume didn't think to add because he hadn't checked status before the call.

## Architecture

A `HealthSnapshotFetcher` service is triggered by the BackgroundAgent's pre-meeting cycle (#17). It reads a `project_health_endpoints` config (JSON map of project_id → health endpoint URL or local script path). For each project matched to the upcoming calendar event, it fetches the health payload, normalizes it to a `HealthSnapshot` struct, and writes it to the KB as a time-stamped context chunk via the Local-Corpus RAG service (#22). The meeting processor then retrieves it via standard RAG lookup. No UI card is shown.

**Dependencies:** BackgroundAgent (#17) for trigger, Composite B (pre-meeting calendar match for project_id), Local-Corpus RAG (#22) for KB write.

## Components (per-file responsibilities)

- `src/services/HealthSnapshotFetcher.ts` — Reads endpoint config, fetches health data (HTTP GET or local script exec), normalizes to `HealthSnapshot`, writes to KB.
- `src/config/projectHealthEndpoints.json` — User-maintained map: `{ "finbiz": "https://status.finbiz.internal/api/health", "qualiaai": "./scripts/qualiaai-health.sh" }`.
- `src/services/HealthSnapshot.ts` — Type definitions: `HealthSnapshot { projectId, fetchedAt, status, alerts: string[], blockers: string[], rawPayload }`.
- `src/services/KBChunkWriter.ts` (extend existing if present, else create) — `writeChunk(text: string, metadata: ChunkMetadata)` — wraps the Local-Corpus RAG ingestion API.

## Data flow

1. BackgroundAgent fires pre-meeting cycle; detects upcoming event with `project_id = 'qualiaai'`.
2. `HealthSnapshotFetcher.fetchForProject('qualiaai')` reads endpoint from config, fetches health data.
3. Response normalized to `HealthSnapshot`; serialized to markdown: `# QualiaAI Health — 2026-04-21T09:55Z\nStatus: degraded\nAlerts: [API timeout on /v2/infer]\n...`
4. `KBChunkWriter.writeChunk(markdown, { projectId, chunkType: 'health-snapshot', fetchedAt })` stores in local corpus.
5. Meeting processor calls KB RAG with attendee+project context → retrieves health chunk → includes in LLM context → task generator cites it.

## Error handling

- Endpoint unreachable: log warning, skip this project, do not block pre-meeting pipeline.
- Script execution error: capture stderr, write error summary as KB chunk ("Health fetch failed: [error]") so the meeting processor knows data is unavailable.
- Stale snapshot: chunks older than 2 hours are tagged `stale=true` in metadata; RAG retriever deprioritizes stale chunks.
- Config missing for a project: silently skip; no error surfaced to user.

## Testing approach

- Unit: `HealthSnapshotFetcher.fetchForProject()` with mocked HTTP response; assert `HealthSnapshot` fields populated correctly.
- Unit: stale detection — chunk with `fetchedAt` > 2 hours ago is tagged `stale=true`.
- Unit: endpoint unreachable → returns null, no exception thrown.
- Integration: BackgroundAgent pre-meeting cycle with mocked calendar (event in 4 min, project_id = 'qualiaai') + mocked health endpoint; assert KB chunk written with correct markdown content.

## Success criteria

- Health snapshot written to KB within the 5-minute pre-meeting window for every project with a configured endpoint.
- Meeting processor task output cites health chunk when a health issue is present in the snapshot.
- Endpoint failure never blocks the pre-meeting pipeline or produces a visible error to the user.
- No human-facing dashboard or UI card — health data surfaces only via KB citation in generated tasks.
- Chunks older than 2 hours deprioritized in RAG retrieval.
