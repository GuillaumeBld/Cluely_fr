> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Build an append-only Structured Decision Ledger (SQLite) that aggregates decisions from three write paths: PostMeetingProcessor (raw extractions), GoalAligner (#13 — goal tagging), and ConflictDetector (#23 — resolution records). Expose typed query methods for the pre-meeting loader and for "what did I commit to" queries. No prose output.

**Architecture:** SQLite tables (decisions + goals) → DecisionLedger service (write paths) → GoalAligner (embedding-based tagging) → LedgerQueryService (read paths) → PreMeetingLoader consumer.

**Tech Stack:** TypeScript · SQLite (better-sqlite3) · Claude embedding API · cosine-similarity

---

### Task 1: Schema + migration

**Files:**
- Create `src/db/migrations/005_decision_ledger.sql`
- Modify `src/db/schema.ts`

- [ ] Step 1: Write migration SQL:
  ```sql
  CREATE TABLE IF NOT EXISTS goals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    embedding   BLOB,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS decisions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id         TEXT NOT NULL,
    timestamp          TEXT NOT NULL,
    speaker            TEXT NOT NULL,
    text               TEXT NOT NULL,
    text_hash          TEXT NOT NULL,
    goal_id            INTEGER REFERENCES goals(id),
    conflict_resolved  INTEGER DEFAULT 0,
    source_edge_id     INTEGER,
    dispatched_job_id  TEXT,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meeting_id, text_hash)
  );
  ```
- [ ] Step 2: Register migration in `src/db/schema.ts` migration runner.
- [ ] Step 3: Write test — run migration on in-memory SQLite; assert both tables exist with expected columns.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(db): add decisions and goals tables (Decision Ledger migration)`

---

### Task 2: GoalRegistry

**Files:**
- Create `src/services/GoalRegistry.ts`
- Create `src/services/__tests__/GoalRegistry.test.ts`

- [ ] Step 1: Write failing test — `GoalRegistry.create({name: 'Archon Release', description: '...'})` inserts a row and returns the goal with id.
- [ ] Step 2: Implement `GoalRegistry.ts` with `create(goal)`, `list()`, `getById(id)`, `findByEmbedding(embedding)` (returns closest goal by cosine similarity). Embeddings computed lazily on first `findByEmbedding` call, cached in-process.
- [ ] Step 3: Run test — expect pass.
- [ ] Step 4: Write test — `findByEmbedding` with a vector close to "Archon Release" returns that goal.
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Commit — `feat(goals): implement GoalRegistry with embedding-based lookup`

---

### Task 3: GoalAligner

**Files:**
- Create `src/services/GoalAligner.ts`
- Create `src/services/__tests__/GoalAligner.test.ts`

- [ ] Step 1: Write failing test — `GoalAligner.align("Write unit tests for the dispatcher")` with a mocked goal registry containing "Archon Release" returns `goal_id` of that goal (similarity above threshold).
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `GoalAligner.align(text: string): Promise<number | null>`:
  - Embed text via Claude embedding endpoint.
  - Call `GoalRegistry.findByEmbedding(embedding)`.
  - Return `goal.id` if cosine similarity ≥ 0.65, else `null`.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — text with no similar goal returns `null` (no exception).
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Commit — `feat(goals): implement GoalAligner with threshold-gated similarity matching`

---

### Task 4: DecisionLedger write API

**Files:**
- Create `src/services/DecisionLedger.ts`
- Create `src/services/__tests__/DecisionLedger.test.ts`

- [ ] Step 1: Write failing test — `DecisionLedger.append({meeting_id, timestamp, speaker, text, goal_id: null})` inserts a row; calling again with same text+meeting raises no error (idempotent via text_hash unique constraint).
- [ ] Step 2: Implement `DecisionLedger.ts`:
  ```typescript
  append(entry: DecisionEntry): void {
    const text_hash = sha256(entry.text);
    db.prepare(`INSERT OR IGNORE INTO decisions (meeting_id, timestamp, speaker, text, text_hash, goal_id, source_edge_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      entry.meeting_id, entry.timestamp, entry.speaker, entry.text, text_hash, entry.goal_id ?? null, entry.source_edge_id ?? null
    );
  }
  ```
  Also implement `appendConflictResolution({ledger_entry_id, action, resolved_at})` — UPDATE decisions SET conflict_resolved=1; and `appendDispatch({ledger_entry_id, job_id})` — UPDATE decisions SET dispatched_job_id=?.
- [ ] Step 3: Run test — expect pass.
- [ ] Step 4: Write test — `appendConflictResolution` sets `conflict_resolved=1` on the target row.
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Write test — `appendDispatch` sets `dispatched_job_id` on the target row.
- [ ] Step 7: Run test — expect pass.
- [ ] Step 8: Commit — `feat(ledger): implement DecisionLedger append, conflict resolution, and dispatch write paths`

---

### Task 5: LedgerQueryService

**Files:**
- Create `src/services/LedgerQueryService.ts`
- Create `src/services/__tests__/LedgerQueryService.test.ts`

- [ ] Step 1: Write failing test — `queryOpenCommitments(goalId, since)` on a db with 3 decisions (2 open, 1 dispatched) returns exactly 2 records.
- [ ] Step 2: Implement `LedgerQueryService.ts`:
  ```typescript
  queryOpenCommitments(goalId?: number, since?: Date): Decision[] {
    return db.prepare(`
      SELECT * FROM decisions
      WHERE dispatched_job_id IS NULL
        AND conflict_resolved = 0
        ${goalId ? 'AND goal_id = ?' : ''}
        ${since ? 'AND created_at > ?' : ''}
      ORDER BY created_at
    `).all(...params) as Decision[];
  }

  queryByMeeting(meetingId: string): Decision[] { ... }
  queryByDateRange(since: Date, until: Date): Decision[] { ... }
  ```
- [ ] Step 3: Run test — expect pass.
- [ ] Step 4: Write test — `queryByDateRange` returns structured Decision objects (not prose).
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Commit — `feat(ledger): implement LedgerQueryService with typed query methods`

---

### Task 6: Wire into PostMeetingProcessor

**Files:**
- Modify `src/services/PostMeetingProcessor.ts`
- Modify `src/services/__tests__/PostMeetingProcessor.test.ts`

- [ ] Step 1: Add `RecapLLM.extractDecisions(transcript)` call (separate from extractActionItems — decisions are agreed facts, not tasks). Prompt: _"List all decisions and verbal agreements made in this transcript. Return JSON: [{text, speaker, timestamp}]."_
- [ ] Step 2: For each extracted decision: call `GoalAligner.align(text)` → goal_id; call `DecisionLedger.append(...)`.
- [ ] Step 3: Write test — fixture transcript with 2 clear decisions; assert 2 rows inserted in decisions table after `PostMeetingProcessor.run()`.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(pipeline): wire decision extraction and ledger writes into PostMeetingProcessor`

---

### Task 7: Pre-meeting loader integration

**Files:**
- Modify `src/services/PreMeetingLoader.ts`
- Modify `src/services/__tests__/PreMeetingLoader.test.ts`

- [ ] Step 1: Write failing test — `PreMeetingLoader.buildPreBrief(meetingId, goalId)` includes `openCommitments` field populated from `LedgerQueryService.queryOpenCommitments(goalId)`.
- [ ] Step 2: Add open commitments query to pre-brief assembly: `preBrief.openCommitments = ledgerQuery.queryOpenCommitments(resolvedGoalId, thirtyDaysAgo)`.
- [ ] Step 3: Run test — expect pass.
- [ ] Step 4: Commit — `feat(pre-meeting): inject open commitments from Decision Ledger into pre-brief`
