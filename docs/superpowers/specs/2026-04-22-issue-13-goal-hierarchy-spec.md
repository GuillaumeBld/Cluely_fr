# Issue #13 — Goal Hierarchy + Action Item Alignment

## Problem & goal

Action items extracted from meetings are stored as plain strings in `summary_json.actionItems` with no link to the project goals they serve. This makes it impossible to answer "what did I commit to toward [goal] this month" or to surface a pre-call hint like "last time you agreed to X toward [goal] — is it done?" The fix: a `goals` table and a `GoalAligner` service that embeds each action item at extraction time and tags it with the closest goal via cosine similarity — no user prompt required.

## User story

> Guillaume creates a goal "Ship Local-Corpus RAG". After a meeting where he agreed to "index the git repo," the action item is automatically tagged with that goal. Before the next relevant meeting, a Launcher banner shows: "Open commitment: index the git repo → Ship Local-Corpus RAG."

## Architecture

Two additions to the Composite A `memory.db` foundation: (1) a `goals` table with parent–child hierarchy for nested objectives; (2) a `GoalAligner` service that embeds each extracted action item and finds the highest-similarity goal above a confidence threshold (default 0.65). Action items in `meetings.summary_json` gain a `goal_id` and `goal_confidence` field. A `GoalHintBuilder` queries open (uncompleted) action items tagged to the inferred meeting goal before each call starts.

## Components (per-file responsibilities)

| File | Responsibility |
|------|---------------|
| `electron/memory/schema.ts` | Add `goals` DDL: `(id TEXT PK, title TEXT, description TEXT, embedding BLOB, parent_id TEXT, created_at INTEGER, completed_at INTEGER)` |
| `electron/memory/GoalAligner.ts` | `alignActionItems(items: string[], meetingId: string): Promise<TaggedItem[]>` — embeds each item, queries `MemoryManager.queryVector` against goals namespace, returns `{text, goal_id, goal_confidence}[]` |
| `electron/memory/GoalHintBuilder.ts` | `buildPreCallHint(goalId: string): OpenCommitment[]` — queries `action_items` where `goal_id = ? AND completed_at IS NULL`, returns structured hint rows |
| `electron/db/DatabaseManager.ts` | Migrate `actionItems: string[]` → `actionItems: ActionItem[]` where `ActionItem = {text, goal_id?, goal_confidence?, speaker?, timestamp?}`; bump schema version |
| `electron/ipcHandlers.ts` | Add `goal:create`, `goal:list`, `goal:complete` IPC handlers |
| `test/memory/GoalAligner.test.ts` | Fixture-based: 3 action items against 3 goals → assert correct goal_id assignments and threshold filtering |

## Data flow

1. **Write (post-meeting):** RecapLLM extracts action items → `GoalAligner.alignActionItems` embeds each + queries vector store (goals namespace) → items with similarity ≥ 0.65 get `goal_id` set; below threshold `goal_id` stays null → `DatabaseManager.updateMeetingSummary` stores `ActionItem[]` in `summary_json`.
2. **Pre-call hint:** `PreMeetingLoader` (Composite B) calls `GoalHintBuilder.buildPreCallHint(detectedGoalId)` → returns open `ActionItem` rows → pushed to Launcher banner as "Open commitment" rows.
3. **Goal management:** IPC `goal:create` → embeds title+description → `MemoryManager.upsertNode` with `type='goal'` namespace → row in `goals` table.

## Error handling

- GoalAligner with no goals in DB: returns all items with `goal_id: null`; does not block recap.
- Embedding pipeline unavailable: log warning, skip alignment, store items as plain strings (backward-compatible schema).
- `goal:complete` on non-existent id: no-op with logged warning.

## Testing approach

- **Unit:** GoalAligner stub-embeds items and goals (fixed float32 arrays), verifies threshold logic and tie-breaking (highest cosine wins).
- **Integration:** Create 2 goals, run alignment on 4 items, assert 3 get tagged and 1 (similarity 0.4) stays null.
- **Schema migration:** Existing `actionItems: ["do X"]` migrates to `[{text: "do X", goal_id: null}]` — verified by snapshot test against `seedDemo.ts` fixture.

## Success criteria

1. After a meeting with ≥ 1 extracted action item and ≥ 1 goal in DB: at least one item has a non-null `goal_id` (when similarity > 0.65).
2. `buildPreCallHint(goalId)` returns only non-completed items — never prose.
3. `goal:list` IPC returns rows with `id`, `title`, `parent_id` — tree-reconstructable client-side.
4. Existing meetings with plain-string `actionItems` survive the migration without data loss (text preserved, `goal_id: null`).
5. GoalAligner with empty goals table exits in < 5 ms without error (fast path).
