> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Implement the Silent Mid-Call Decision Capture Layer — a trio of main-process services (LunrIndexer, SlidingWindowAnalyzer, IpcEventBus) that silently detect and buffer verbal commitments during a meeting, then inject pre-annotated hints into the post-meeting LLM prompt. No UI surface during the call. Source issues: #2 + #14 + #18.

**Architecture:** Three new services in `electron/services/`, one new `TaskGeneratorBuffer`, modifications to `ProcessingHelper` and `main.ts`. All components live in the Electron main process. The IpcEventBus is a typed EventEmitter singleton; it does NOT expose raw events to the renderer. The SlidingWindowAnalyzer runs on a 90s interval tied to the meeting lifecycle.

**Tech Stack:** TypeScript, Electron (main process), lunr.js, Node.js EventEmitter, better-sqlite3 (for MemoryGraphWriter integration, guarded by feature flag).

---

### Task 1: IpcEventBus — typed internal event bus

**Files:**
- Create `electron/services/IpcEventBus.ts`
- Create `electron/services/__tests__/IpcEventBus.test.ts`

- [ ] Step 1: Write failing test — `IpcEventBus` is a singleton, `emit("decision:captured", payload)` triggers registered `on("decision:captured", handler)` listener with correct typed payload.
- [ ] Step 2: Run test: `npx jest electron/services/__tests__/IpcEventBus.test.ts` → expect FAIL (module not found).
- [ ] Step 3: Implement `IpcEventBus.ts`:
  ```typescript
  import { EventEmitter } from "events";

  export interface DecisionCapturedEvent {
    type: "ownership" | "commitment" | "deadline" | "unresolved";
    speaker: string;
    timestamp: number; // ms since epoch
    text_excerpt: string;
    confidence: number; // 0-1
    meeting_id: string;
    turn_id: string;
  }

  type BusEvents = {
    "decision:captured": DecisionCapturedEvent;
    "meeting:started": { meeting_id: string };
    "meeting:ended": { meeting_id: string };
  };

  class IpcEventBusClass extends EventEmitter {
    private static instance: IpcEventBusClass;
    static getInstance(): IpcEventBusClass {
      if (!this.instance) this.instance = new IpcEventBusClass();
      return this.instance;
    }
    emitTyped<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
      this.emit(event, payload);
    }
    onTyped<K extends keyof BusEvents>(event: K, handler: (payload: BusEvents[K]) => void): void {
      this.on(event, handler);
    }
    offTyped<K extends keyof BusEvents>(event: K, handler: (payload: BusEvents[K]) => void): void {
      this.off(event, handler);
    }
  }

  export const IpcEventBus = IpcEventBusClass.getInstance();
  ```
- [ ] Step 4: Run test → expect PASS.
- [ ] Step 5: Commit: `feat(ipc): add typed IpcEventBus singleton for internal main-process events`.

---

### Task 2: LunrIndexer — in-memory speaker-turn index

**Files:**
- Create `electron/services/LunrIndexer.ts`
- Create `electron/services/__tests__/LunrIndexer.test.ts`

- [ ] Step 1: Write failing tests:
  - `addTurn` adds a turn; `getWindow(300)` returns turns from last 300s in chronological order.
  - `getWindow` returns empty array when no turns exist.
  - `search("agreed")` returns matching turns by text.
- [ ] Step 2: Run tests → expect FAIL.
- [ ] Step 3: Install lunr if not present: `bun add lunr && bun add -d @types/lunr`.
- [ ] Step 4: Implement `LunrIndexer.ts`:
  ```typescript
  import lunr from "lunr";

  export interface SpeakerTurn {
    turn_id: string;
    speaker: string;
    text: string;
    timestamp: number; // ms since epoch
    meeting_id: string;
  }

  export class LunrIndexer {
    private turns: SpeakerTurn[] = [];
    private idx: lunr.Index | null = null;
    private dirty = true;

    addTurn(turn: SpeakerTurn): void {
      this.turns.push(turn);
      this.dirty = true;
    }

    private rebuild(): void {
      const turns = this.turns;
      this.idx = lunr(function () {
        this.ref("turn_id");
        this.field("text");
        this.field("speaker");
        turns.forEach(t => this.add(t));
      });
      this.dirty = false;
    }

    search(query: string): SpeakerTurn[] {
      if (this.dirty) this.rebuild();
      if (!this.idx) return [];
      const results = this.idx.search(query);
      const idSet = new Set(results.map(r => r.ref));
      return this.turns.filter(t => idSet.has(t.turn_id));
    }

    getWindow(lastSeconds: number): SpeakerTurn[] {
      const cutoff = Date.now() - lastSeconds * 1000;
      return this.turns.filter(t => t.timestamp >= cutoff).sort((a, b) => a.timestamp - b.timestamp);
    }

    clear(): void {
      this.turns = [];
      this.idx = null;
      this.dirty = true;
    }

    allTurns(): SpeakerTurn[] {
      return [...this.turns];
    }
  }
  ```
- [ ] Step 5: Run tests → expect PASS.
- [ ] Step 6: Commit: `feat(indexer): add LunrIndexer for in-process speaker-turn indexing`.

---

### Task 3: SlidingWindowAnalyzer — heuristic commitment detector

**Files:**
- Create `electron/services/SlidingWindowAnalyzer.ts`
- Create `electron/services/__tests__/SlidingWindowAnalyzer.test.ts`

- [ ] Step 1: Write failing tests:
  - Feed 5 turns including `"I'll handle the migration"` and `"You should send the report"` → assert 2 `decision:captured` events emitted on bus.
  - Feed 5 neutral turns → assert 0 events.
  - Feed same turn twice (duplicate `turn_id`) across two `tick()` calls → assert event emitted only once.
- [ ] Step 2: Run tests → expect FAIL.
- [ ] Step 3: Implement `SlidingWindowAnalyzer.ts`:
  ```typescript
  import { LunrIndexer, SpeakerTurn } from "./LunrIndexer";
  import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";

  const COMMITMENT_PATTERNS: Array<{ re: RegExp; type: DecisionCapturedEvent["type"] }> = [
    { re: /\bi'?ll\b/i,                        type: "commitment" },
    { re: /\byou should\b/i,                   type: "ownership"  },
    { re: /\baction item\b/i,                  type: "ownership"  },
    { re: /\bwe agreed\b/i,                    type: "commitment" },
    { re: /\bby (monday|tuesday|wednesday|thursday|friday|end of (day|week))\b/i, type: "deadline" },
    { re: /\bstill unresolved\b|\bblocked on\b/i, type: "unresolved" },
  ];

  export class SlidingWindowAnalyzer {
    private intervalId: NodeJS.Timeout | null = null;
    private seenTurnIds = new Set<string>();
    private meetingId = "";

    constructor(private indexer: LunrIndexer, private windowSeconds = 300, private intervalMs = 90_000) {}

    start(meetingId: string): void {
      this.meetingId = meetingId;
      this.seenTurnIds.clear();
      this.intervalId = setInterval(() => this.tick(), this.intervalMs);
    }

    stop(): void {
      if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    }

    tick(): void {
      const turns = this.indexer.getWindow(this.windowSeconds);
      for (const turn of turns) {
        if (this.seenTurnIds.has(turn.turn_id)) continue;
        for (const { re, type } of COMMITMENT_PATTERNS) {
          if (re.test(turn.text)) {
            this.seenTurnIds.add(turn.turn_id);
            IpcEventBus.emitTyped("decision:captured", {
              type,
              speaker: turn.speaker,
              timestamp: turn.timestamp,
              text_excerpt: turn.text.slice(0, 200),
              confidence: 0.7,
              meeting_id: this.meetingId,
              turn_id: turn.turn_id,
            });
            break; // one event per turn
          }
        }
      }
    }
  }
  ```
- [ ] Step 4: Run tests → expect PASS.
- [ ] Step 5: Commit: `feat(analyzer): add SlidingWindowAnalyzer with heuristic commitment detection`.

---

### Task 4: TaskGeneratorBuffer — pre-annotation accumulator

**Files:**
- Create `electron/services/TaskGeneratorBuffer.ts`
- Create `electron/services/__tests__/TaskGeneratorBuffer.test.ts`

- [ ] Step 1: Write failing tests:
  - Subscribe to bus; emit 3 `decision:captured` events; `flush()` returns all 3; `clear()` empties buffer; second `flush()` returns empty array.
- [ ] Step 2: Run tests → expect FAIL.
- [ ] Step 3: Implement `TaskGeneratorBuffer.ts`:
  ```typescript
  import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";

  export class TaskGeneratorBuffer {
    private buffer: DecisionCapturedEvent[] = [];
    private handler: (e: DecisionCapturedEvent) => void;

    constructor() {
      this.handler = (e) => this.buffer.push(e);
      IpcEventBus.onTyped("decision:captured", this.handler);
    }

    flush(): DecisionCapturedEvent[] {
      return [...this.buffer];
    }

    clear(): void {
      this.buffer = [];
    }

    destroy(): void {
      IpcEventBus.offTyped("decision:captured", this.handler);
      this.clear();
    }
  }

  export const taskGeneratorBuffer = new TaskGeneratorBuffer();
  ```
- [ ] Step 4: Run tests → expect PASS.
- [ ] Step 5: Commit: `feat(buffer): add TaskGeneratorBuffer that accumulates decision:captured events`.

---

### Task 5: Modify ProcessingHelper to inject decision hints

**Files:**
- Modify `electron/ProcessingHelper.ts`

- [ ] Step 1: Read `electron/ProcessingHelper.ts` to locate where the LLM prompt string is assembled (search for `buildPrompt` or the string passed to the Claude/Gemini API).
- [ ] Step 2: Write failing test in `electron/__tests__/ProcessingHelper.test.ts`:
  - Pre-populate `taskGeneratorBuffer` with 2 synthetic `DecisionCapturedEvent`s.
  - Call the prompt-building function.
  - Assert the returned string contains `## Pre-annotated decision hints` and both `text_excerpt` values.
- [ ] Step 3: Run test → expect FAIL.
- [ ] Step 4: In `ProcessingHelper.ts`, before the LLM call, import `taskGeneratorBuffer` and inject hints:
  ```typescript
  import { taskGeneratorBuffer } from "./services/TaskGeneratorBuffer";

  // Inside the prompt-building method, before sending to LLM:
  const hints = taskGeneratorBuffer.flush();
  taskGeneratorBuffer.clear();
  let hintsBlock = "";
  if (hints.length > 0) {
    const lines = hints.map(h =>
      `- [${h.type}] ${h.speaker} @ ${new Date(h.timestamp).toISOString()}: "${h.text_excerpt}" (confidence: ${h.confidence})`
    ).join("\n");
    hintsBlock = `\n\n## Pre-annotated decision hints\nThe following commitments were detected mid-call. Use them to improve action item extraction:\n${lines}\n`;
  }
  // Prepend hintsBlock to the transcript/user content passed to the LLM
  ```
- [ ] Step 5: Run test → expect PASS.
- [ ] Step 6: Commit: `feat(processing): inject mid-call decision hints into post-meeting LLM prompt`.

---

### Task 6: Wire services into main.ts meeting lifecycle

**Files:**
- Modify `electron/main.ts` (or wherever `AppState` initializes services)
- Modify `electron/audio/DeepgramStreamingSTT.ts` (or `MicrophoneCapture.ts`) to call `indexer.addTurn`

- [ ] Step 1: Read `electron/main.ts` to find where meeting start/end events are fired and where STT callbacks are registered.
- [ ] Step 2: In `AppState` initialization, instantiate `LunrIndexer`, `SlidingWindowAnalyzer`, and ensure `taskGeneratorBuffer` singleton is loaded.
- [ ] Step 3: In STT result callback (wherever speaker turns arrive), call:
  ```typescript
  lunrIndexer.addTurn({
    turn_id: `${meetingId}_${Date.now()}`,
    speaker: result.speaker ?? "unknown",
    text: result.transcript,
    timestamp: Date.now(),
    meeting_id: currentMeetingId,
  });
  ```
- [ ] Step 4: On meeting start event, call `slidingWindowAnalyzer.start(meetingId)` and `IpcEventBus.emitTyped("meeting:started", { meeting_id: meetingId })`.
- [ ] Step 5: On meeting end event, call `slidingWindowAnalyzer.stop()`, `lunrIndexer.clear()`, `taskGeneratorBuffer.clear()`, and `IpcEventBus.emitTyped("meeting:ended", { meeting_id: meetingId })`.
- [ ] Step 6: Manual smoke test: start a test meeting, speak a phrase containing "I'll handle", confirm a `[decision:captured]` log line appears in `natively_debug.log` within 90s.
- [ ] Step 7: Commit: `feat(main): wire LunrIndexer and SlidingWindowAnalyzer into meeting lifecycle`.

---

### Task 7: MemoryGraphWriter stub (guarded by feature flag)

**Files:**
- Create `electron/services/MemoryGraphWriter.ts`

- [ ] Step 1: Implement a stub that subscribes to `decision:captured` and no-ops if the memory graph tables (Composite A) are not yet present:
  ```typescript
  import { IpcEventBus, DecisionCapturedEvent } from "./IpcEventBus";
  import { DatabaseManager } from "../db/DatabaseManager";

  export class MemoryGraphWriter {
    constructor() {
      IpcEventBus.onTyped("decision:captured", (e) => this.write(e));
    }
    private write(e: DecisionCapturedEvent): void {
      try {
        const db = DatabaseManager.getInstance().getDatabase();
        // No-op if memory graph tables don't exist yet (Composite A not live)
        const tableExists = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_nodes'"
        ).get();
        if (!tableExists) return;
        // TODO: insert low-confidence node when Composite A schema is live
        console.log(`[MemoryGraphWriter] Queued low-confidence relation: ${e.type} by ${e.speaker}`);
      } catch {
        // Silently fail — Composite C must not break if DB is unavailable
      }
    }
  }
  ```
- [ ] Step 2: Instantiate in `main.ts` alongside other services.
- [ ] Step 3: Commit: `feat(memory): add MemoryGraphWriter stub, no-op until Composite A schema is live`.
