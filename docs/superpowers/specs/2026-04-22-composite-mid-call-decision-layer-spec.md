# Composite C — Silent Mid-Call Decision Capture Layer

**Source issues:** #2 (Proactive Advice → Silent Decision Buffer) + #14 (WebSocket → Typed IPC Event Bus) + #18 (Live Transcript Search → Lunr Indexer Backend)

---

## Problem & goal

During a meeting, decisions are made verbally and scattered across a 60-minute transcript. When the post-meeting pipeline runs on the full transcript, it must infer these decisions cold — missing context, mislabeling ownership, and hallucinating obligations. This composite installs three interlocking subsystems that silently capture decisions *as they happen*, so the post-meeting task generator starts with pre-annotated hints rather than raw text.

**Goal:** Zero UI surface, maximum decision capture fidelity. The user sees no overlay during the call; the system captures, the user reviews after.

---

## User story

> As Guillaume, I want every ownership assignment and verbal commitment made during a Zoom call to be automatically surfaced in my post-meeting approval tray, cited back to the exact moment it was said, without me typing anything or seeing any overlay during the meeting.

---

## Architecture

Three components, each scoped to the Electron main process:

1. **LunrIndexer** — indexes each speaker turn (text + speaker + timestamp) into an in-memory lunr index as STT results arrive.
2. **SlidingWindowAnalyzer** — fires every 90 seconds, scans the last 5 minutes of turns via the index, uses a lightweight heuristic (+ optional LLM) to detect commitments, then emits `decision:captured` events on the IPC event bus.
3. **IpcEventBus** — typed `EventEmitter` wrapper around `ipcMain`; replaces ad-hoc `webContents.send` calls for internal main-process events; exposes `emit` / `on` for internal subscribers only (no renderer exposure of raw events).

Two internal subscribers on the bus:
- **TaskGeneratorBuffer** — accumulates `decision:captured` events and flushes them as pre-annotated hints to `ProcessingHelper` before full transcript LLM call.
- **MemoryGraphWriter** — appends low-confidence relations to the memory graph (Composite A) for post-meeting user review.

---

## Components

| File | Responsibility |
|------|---------------|
| `electron/services/LunrIndexer.ts` | Maintains an in-memory lunr index; `addTurn(turn)` / `search(query)` / `getWindow(lastNSeconds)` |
| `electron/services/SlidingWindowAnalyzer.ts` | 90s interval, reads last 300s of turns from LunrIndexer, detects decision patterns, emits `decision:captured` on IpcEventBus |
| `electron/services/IpcEventBus.ts` | Typed `EventEmitter` singleton; defines event schemas; wraps `ipcMain` for push-to-renderer events, exposes `emit`/`on` for main-process subscriptions |
| `electron/services/TaskGeneratorBuffer.ts` | Subscribes to `decision:captured`; accumulates per-meeting buffer; exposes `flush(): DecisionHint[]` and `clear()` |
| `electron/ProcessingHelper.ts` | Modified to call `TaskGeneratorBuffer.flush()` before building the LLM prompt; injects hints as a preamble block |
| `electron/main.ts` | Wires up all services at startup; passes `LunrIndexer` to STT callback; starts/stops `SlidingWindowAnalyzer` on meeting lifecycle events |

---

## Data flow

```
STT callback → LunrIndexer.addTurn(turn)
                        ↓ (every 90s)
              SlidingWindowAnalyzer.tick()
                  → LunrIndexer.getWindow(300s)
                  → detect commitments (heuristic / LLM)
                  → IpcEventBus.emit("decision:captured", event)
                           ↓                    ↓
               TaskGeneratorBuffer         MemoryGraphWriter
               .accumulate(event)          .appendLowConfidence(event)
                        ↓ (at meeting end)
               ProcessingHelper.buildPrompt()
                  → TaskGeneratorBuffer.flush() → injected as hints preamble
                  → LLM call with pre-annotated context
```

---

## Error handling

- **LunrIndexer full-text miss**: heuristic pattern matching (regex: `"I'll", "you should", "we agreed", "action:") provides fallback when lunr returns no matches.
- **SlidingWindowAnalyzer crash**: errors are caught and logged; the meeting continues unaffected — the buffer may be empty at post-processing time, which is safe (graceful degradation).
- **IpcEventBus listener leak**: bus is scoped per meeting session; `clear()` on meeting end removes all per-meeting listeners.
- **Memory graph unavailable (Composite A not yet live)**: `MemoryGraphWriter` no-ops gracefully if `DatabaseManager` graph tables are absent.

---

## Testing approach

- **Unit tests** (`LunrIndexer`): verify `addTurn` → `getWindow` returns correct chronological slice.
- **Unit tests** (`SlidingWindowAnalyzer`): feed fixture transcript turns, assert `decision:captured` events are emitted for known commitment phrases; assert no event for neutral turns.
- **Integration test** (`TaskGeneratorBuffer` → `ProcessingHelper`): mock bus, emit 3 synthetic events, call `ProcessingHelper.buildPrompt()`, assert hints preamble appears in the LLM prompt string.
- **Regression**: `SlidingWindowAnalyzer` must not emit duplicate events for the same transcript segment across consecutive ticks (deduplication by `turn_id`).

---

## Success criteria

| Criterion | Measurement |
|-----------|-------------|
| Decision hint coverage | ≥70% of manually-labeled commitments in 3 fixture transcripts appear in `TaskGeneratorBuffer` at meeting end |
| No UI regression | No new overlays, badges, or modals visible during a test meeting run |
| Post-meeting prompt enrichment | LLM prompt for post-meeting processing includes `## Pre-annotated hints` section when buffer is non-empty |
| Graceful degradation | If `SlidingWindowAnalyzer` throws, meeting recording and post-processing complete normally |
| Deduplication | Zero duplicate events for any single speaker turn across consecutive analyzer ticks |
