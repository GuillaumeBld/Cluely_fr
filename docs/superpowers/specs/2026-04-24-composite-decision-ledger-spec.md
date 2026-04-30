# Composite D — Structured Decision Ledger

**Source issues:** #3 (reshaped) + #13 + #23

## Problem & goal

Three issues serve slices of "what did I decide, for which goal, and is it still true?": #3 captures decisions chronologically, #13 links them to project goals, #23 detects when new meetings contradict existing entries. Without integration, each is incomplete: a decision store without goal linkage is an audit log with no navigation; goal linkage without conflict detection silently accumulates stale commitments. The Structured Decision Ledger merges them into a single append-only store where every entry carries: speaker-attributed decision text, the goal it advances, and a conflict_resolved flag when #23 reconciled a contradiction. Success signal #7 ("what did I commit to in the last 30 days") is answered by a single SQL query returning structured records, not prose.

## User story

Guillaume asks "what did I commit to toward the Archon release in the last two weeks?" The system returns a structured list of ledger entries — each with meeting source, timestamp, speaker, decision text, linked goal, and dispatch status — without any chat interaction or manual search. Before the next meeting related to that goal, the pre-meeting loader surfaces open commitments from the ledger as a pre-brief card.

## Architecture

A `DecisionLedger` service wraps an append-only SQLite table. Three write paths feed it: (1) `PostMeetingProcessor` writes extracted decisions after each meeting; (2) `GoalAligner` (#13) tags each entry with a goal via embedding similarity at write time; (3) `ConflictDetector` (#23) writes resolution records with `conflict_resolved = true`. A `LedgerQueryService` exposes structured queries (by date range, goal, meeting, speaker). The pre-meeting loader reads open commitments from the ledger to populate the pre-brief card.

## Components (per-file responsibilities)

- `src/db/migrations/005_decision_ledger.sql` — Append-only table schema.
- `src/services/DecisionLedger.ts` — `append(entry)`, `appendConflictResolution(...)`, `appendDispatch(...)`, `queryOpenCommitments(goalId?, since?)`, `queryByMeeting(meetingId)`.
- `src/services/GoalAligner.ts` — Embeds each decision text; cosine-matches against a `goals` table to assign `goal_id`; falls back to null if no match above threshold.
- `src/services/GoalRegistry.ts` — CRUD for the `goals` table (id, name, description, embedding). Seeded manually or from issue #13 goal hierarchy.
- `src/services/LedgerQueryService.ts` — Named query methods; never returns prose, always structured records.

## Data flow

1. `PostMeetingProcessor` calls `RecapLLM.extractDecisions(transcript)` → raw decision list.
2. Each decision: `GoalAligner.align(text)` → `goal_id`.
3. `DecisionLedger.append({ meeting_id, timestamp, speaker, text, goal_id, source_edge_id })`.
4. `ConflictDetector` writes `appendConflictResolution({ ledger_entry_id, action, resolved_at })`.
5. `ArchonDispatcher` writes `appendDispatch({ ledger_entry_id, job_id })`.
6. Pre-meeting loader calls `LedgerQueryService.queryOpenCommitments(goal_id)` → pre-brief data.

## Data model

```sql
CREATE TABLE decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id    TEXT NOT NULL,
  timestamp     TEXT NOT NULL,
  speaker       TEXT NOT NULL,
  text          TEXT NOT NULL,
  goal_id       INTEGER REFERENCES goals(id),
  conflict_resolved INTEGER DEFAULT 0,
  source_edge_id    INTEGER,
  dispatched_job_id TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE goals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  embedding   BLOB
);
```

## Error handling

- GoalAligner fails: entry written with `goal_id = null`; no exception thrown.
- Duplicate detection: unique constraint on `(meeting_id, timestamp, speaker, text_hash)` prevents double-writes on retry.
- Query returns empty: returns `[]`, never null, never an error.

## Testing approach

- Unit: `DecisionLedger.append()` with in-memory SQLite; assert row inserted with correct fields.
- Unit: `GoalAligner.align()` with mocked embeddings; assert correct goal_id returned for high-similarity match; assert null for low-similarity.
- Unit: `LedgerQueryService.queryOpenCommitments(goalId, since)` returns only entries without dispatched_job_id and without conflict_resolved=1.
- Integration: full post-meeting pipeline writes entries; pre-meeting loader reads them back in same db session.

## Success criteria

- `SELECT * FROM decisions WHERE created_at > ? ORDER BY created_at` returns structured records for any 30-day window.
- Every decision with a project reference carries a non-null `goal_id`.
- Conflict resolutions are queryable by `conflict_resolved = 1` filter.
- Pre-meeting loader receives open commitments within 500 ms of goal_id lookup.
- No prose output from any `LedgerQueryService` method — only typed records.
