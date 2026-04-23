> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Implement a ConflictDetector service that extracts entity-relation-value triples from meeting transcripts, compares them against the unified memory graph (Composite A), and surfaces up to 2 contradictions per meeting as resolution cards in the approval tray. Resolution choices (update/ignore/flag) are persisted to both the graph and the Decision Ledger.

**Architecture:** `ConflictDetector` service → `MemoryGraphClient` query → cosine similarity → `conflict:detected` event on IPC bus → `ConflictCard` tray component → IPC handler → graph + ledger write. Rate limiter caps surfaced conflicts at 2/meeting; overflow goes to a pending_conflicts SQLite queue.

**Tech Stack:** TypeScript · Electron IPC · SQLite (better-sqlite3) · Claude API (triple extraction prompt) · cosine-similarity (npm) · React (ConflictCard)

---

### Task 1: Triple extraction + conflict detection service

**Files:**
- Create `src/services/ConflictDetector.ts`
- Create `src/services/__tests__/ConflictDetector.test.ts`

- [ ] Step 1: Write failing test — given a fixture transcript with a known ownership reversal, assert `extractTriples()` returns a triple array containing the new ownership claim.
- [ ] Step 2: Run `npx jest ConflictDetector.test.ts` — expect failure (file doesn't exist).
- [ ] Step 3: Implement `extractTriples(transcript: string): Promise<Triple[]>` using a Claude API call with a structured prompt: _"Extract entity-relation-value triples from the following transcript. Return JSON array: [{entity, relation, value, speaker, timestamp}]."_ Parse JSON response; return empty array on parse error.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write failing test — given two triples with same entity+relation but different values (cosine distance ≥ 0.75), assert `detectConflicts(newTriples, graphTriples)` returns one `ConflictPair`.
- [ ] Step 6: Implement `detectConflicts()` using `cosine-similarity` npm package on sentence embeddings (call Claude embedding endpoint). Rate-limit output to 2 items; push remainder to `pending_conflicts` queue.
- [ ] Step 7: Run test — expect pass.
- [ ] Step 8: Write regression test — same entity discussed in two different project scopes should NOT produce a conflict pair. Assert empty result.
- [ ] Step 9: Run test — expect pass.
- [ ] Step 10: Commit — `feat(conflict): add ConflictDetector service with triple extraction and similarity comparison`

---

### Task 2: MemoryGraphClient extensions

**Files:**
- Modify `src/services/MemoryGraphClient.ts`
- Modify `src/services/__tests__/MemoryGraphClient.test.ts`

- [ ] Step 1: Write failing test — `queryEntityRelations('Luca', projectId)` on an in-memory SQLite db with a seeded node returns the stored triple.
- [ ] Step 2: Run test — expect failure (method doesn't exist).
- [ ] Step 3: Add `queryEntityRelations(entityLabel: string, projectId: string): Triple[]` — SELECT from nodes + edges table filtered by entity label and project_id scope tag.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write failing test — `updateNodeValue(nodeId, newValue, 'update')` changes the node value and writes a resolution record.
- [ ] Step 6: Implement `updateNodeValue()` using a SQLite transaction: UPDATE nodes SET value=?, updated_at=NOW(); INSERT INTO conflict_resolutions.
- [ ] Step 7: Run test — expect pass.
- [ ] Step 8: Commit — `feat(memory): add queryEntityRelations and updateNodeValue to MemoryGraphClient`

---

### Task 3: pending_conflicts SQLite queue

**Files:**
- Create `src/db/migrations/004_pending_conflicts.sql`
- Modify `src/db/schema.ts`

- [ ] Step 1: Write migration SQL:
  ```sql
  CREATE TABLE IF NOT EXISTS pending_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL,
    entity TEXT NOT NULL,
    relation TEXT NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    speaker TEXT,
    timestamp TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );
  ```
- [ ] Step 2: Add migration to schema migration runner in `src/db/schema.ts`.
- [ ] Step 3: Write test — insert a pending conflict, query it back, assert fields match.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(db): add pending_conflicts queue table`

---

### Task 4: IPC event bus wiring + handlers

**Files:**
- Create `src/ipc/conflictHandlers.ts`
- Modify `src/ipc/index.ts`

- [ ] Step 1: Write failing test — mock `ipcMain.handle('conflict:resolve', ...)` handler; call with `{nodeId, action: 'update', newValue}` payload; assert `MemoryGraphClient.updateNodeValue` called and `DecisionLedger.appendConflictResolution` called.
- [ ] Step 2: Implement `conflictHandlers.ts`:
  ```typescript
  ipcMain.handle('conflict:resolve', async (_, { nodeId, action, newValue, conflictId }) => {
    if (action === 'update') await memoryGraph.updateNodeValue(nodeId, newValue, 'update');
    await decisionLedger.appendConflictResolution({ conflictId, action, resolvedAt: new Date() });
  });
  ```
- [ ] Step 3: Register handler in `src/ipc/index.ts`.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(ipc): add conflict resolution IPC handler`

---

### Task 5: ConflictCard React component

**Files:**
- Create `src/components/ConflictCard.tsx`
- Create `src/components/__tests__/ConflictCard.test.tsx`

- [ ] Step 1: Write failing render test — given a conflict prop `{entity, oldValue, newValue, speaker, timestamp}`, assert card renders old and new values, and three buttons: "Update Graph", "Ignore", "Flag".
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `ConflictCard`:
  ```tsx
  export function ConflictCard({ conflict, onResolve }: Props) {
    return (
      <div className="conflict-card">
        <p><strong>{conflict.entity}</strong> — was: <em>{conflict.oldValue}</em></p>
        <p>Now: <em>{conflict.newValue}</em> — {conflict.speaker} @ {conflict.timestamp}</p>
        <button onClick={() => onResolve('update')}>Update Graph</button>
        <button onClick={() => onResolve('ignore')}>Ignore</button>
        <button onClick={() => onResolve('flag')}>Flag</button>
      </div>
    );
  }
  ```
- [ ] Step 4: Wire `onResolve` to `window.ipcRenderer.invoke('conflict:resolve', {...})` in parent tray component.
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Commit — `feat(ui): add ConflictCard tray component`

---

### Task 6: Post-meeting summary conflict digest

**Files:**
- Modify `src/services/PostMeetingProcessor.ts`
- Modify `src/services/__tests__/PostMeetingProcessor.test.ts`

- [ ] Step 1: Write failing test — given a meeting with 1 resolved conflict in the ledger, `buildSummary(meetingId)` returns a string containing "Memory Conflicts Resolved" section with the reconciled item listed.
- [ ] Step 2: Add `appendConflictDigest(meetingId: string, summary: string): string` to `PostMeetingProcessor` — queries DecisionLedger for resolved conflicts of this meeting, appends section.
- [ ] Step 3: Run test — expect pass.
- [ ] Step 4: Write test — meeting with 0 conflicts still produces an empty "Memory Conflicts Resolved" section (not absent).
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Commit — `feat(recap): append conflict digest section to post-meeting summary`

---

### Task 7: End-to-end integration test

**Files:**
- Create `src/__tests__/integration/conflictDetection.test.ts`

- [ ] Step 1: Write integration test using fixture transcript (`fixtures/ownership-reversal.txt`) that contains "Marie will own the API work instead of Luca". Seed the memory graph with Luca as owner. Run full `ConflictDetector.run(transcript, meetingId)` pipeline. Assert: `conflict:detected` event emitted, pending_conflicts table has 0 rows (under cap), ConflictCard receives correct props.
- [ ] Step 2: Run test — expect pass.
- [ ] Step 3: Write false-positive test — transcript mentions same entity in two scopes (`project_id` differs). Assert no `conflict:detected` emitted.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `test(conflict): add end-to-end conflict detection integration test`
