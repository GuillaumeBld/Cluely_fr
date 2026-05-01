# Conflict Detection vs Memory Graph

## Problem & goal

The memory graph (Composite A) accumulates facts from every meeting. Without a conflict detector, a new meeting can silently introduce a contradictory fact — e.g., ownership of a deliverable changed hands verbally but the graph still shows the prior owner. The goal is to detect such contradictions during or immediately after meeting processing and surface them for resolution before they corrupt downstream task generation.

## User story

After a meeting where a prior decision is reversed ("Actually, Marie will own the API work, not Luca"), the system automatically flags the contradiction against the existing graph node, presents a resolution card (update / ignore / flag for later), and writes the resolution to the Decision Ledger. Guillaume never sees a task generated from stale data.

## Architecture

A `ConflictDetector` service runs on each post-meeting transcript batch (and optionally on the mid-call decision buffer from Composite C). It extracts entity-relation-value triples from the new transcript, queries the memory graph for matching entities, computes semantic similarity between old and new values, and emits `conflict:detected` events for each pair exceeding the threshold. A lightweight resolution UI (conflict card in the approval tray) lets Guillaume pick update / ignore / flag; the choice is written back to both the graph and the Decision Ledger.

**Hard dependency:** Composite A (unified memory graph with typed edges) must be live. Issue #23 is a Tranche 2 feature.

## Components (per-file responsibilities)

- `src/services/ConflictDetector.ts` — Triple extraction via LLM prompt on transcript segments; cosine similarity comparison against graph nodes; emits typed `conflict:detected` events; rate-limited to 2 conflicts surfaced per call to avoid alert fatigue.
- `src/services/MemoryGraphClient.ts` (extend existing) — `queryEntityRelations(entityLabel: string)` returning existing triples; `updateNodeValue(nodeId, newValue, resolution)` for post-resolution writes.
- `src/components/ConflictCard.tsx` — Tray card UI: shows old vs new value, speaker + timestamp citation, three action buttons (Update Graph / Ignore / Flag).
- `src/ipc/conflictHandlers.ts` — IPC handlers wiring ConflictCard actions to MemoryGraphClient and DecisionLedger writes.
- `src/services/DecisionLedger.ts` (extend existing) — Append conflict resolution record with `conflict_resolved = true` and resolution action taken.

## Data flow

1. Post-meeting processor (or Composite C buffer) passes transcript segments to `ConflictDetector.extractTriples()`.
2. Detector queries `MemoryGraphClient.queryEntityRelations()` for each extracted entity.
3. Cosine similarity computed between existing and new values; pairs above threshold emitted as `conflict:detected`.
4. Event bus delivers up to 2 events per meeting to the approval tray renderer.
5. User selects action in `ConflictCard`; IPC handler writes resolution to graph + ledger.
6. Post-meeting summary appends "Memory Conflicts Resolved" section listing reconciled items.

## Error handling

- False-positive mitigation: conflict threshold set conservatively (≥ 0.75 cosine distance); entity scope tag (project_id) must match to qualify.
- LLM extraction failure: log and skip segment; never block meeting processing.
- Rate limiter (2/meeting): excess conflicts written to a "pending conflicts" queue in SQLite for deferred review.
- Graph not available: ConflictDetector no-ops with a warning log; does not throw.

## Testing approach

- Unit: `extractTriples()` with fixture transcripts including known contradictions; assert correct triple pairs.
- Unit: similarity threshold boundary tests — ensure items below threshold are not emitted.
- Integration: end-to-end with in-memory SQLite graph; assert `conflict:detected` event emitted and resolution persisted correctly.
- Regression fixture: transcript where same entity is discussed in two scopes (should NOT trigger conflict); assert no false positive.

## Success criteria

- Given a transcript containing a reversal of a graph-stored fact, `ConflictDetector` emits a `conflict:detected` event within 30 seconds of transcript processing start.
- Rate limiter caps surfaced conflicts at 2 per meeting; excess are queued, not dropped.
- Post-meeting summary always includes a "Memory Conflicts Resolved" section (empty if none).
- False-positive rate on same-scope entity mentions: < 10% in regression fixture suite.
- Resolution (any action) written to Decision Ledger within 500 ms of user button press.
