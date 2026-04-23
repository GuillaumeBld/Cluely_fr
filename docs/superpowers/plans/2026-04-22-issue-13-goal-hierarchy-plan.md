> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Add a goal hierarchy to Cluely_fr and auto-tag extracted meeting action items with the closest matching goal via embedding similarity. Surface open commitments as a pre-call hint in the Launcher banner. No user prompt during meeting processing.

**Architecture:** `goals` table lives in `memory.db` (Composite A). `GoalAligner` embeds each action item at post-meeting time and runs a vector similarity query against the goals namespace. `DatabaseManager.actionItems` schema promoted from `string[]` to `ActionItem[]`. `GoalHintBuilder` powers the pre-call banner row.

**Tech Stack:** TypeScript · better-sqlite3 · sqlite-vec (Composite A EmbeddingPipeline) · Electron IPC · Vitest

**Dependencies:** Composite A (`electron/memory/MemoryManager.ts`, `electron/memory/schema.ts`, `electron/memory/EmbeddingPipeline.ts`) must be merged and functional.

---

### Task 1: Extend memory schema with goals table

**Files:**
- Modify `electron/memory/schema.ts`

- [ ] Step 1: Write test `test/memory/schema.test.ts` — assert `goals` table exists after migration with columns `id, title, description, embedding, parent_id, created_at, completed_at`.
- [ ] Step 2: Run `npx vitest run test/memory/schema.test.ts` — expect failure (table doesn't exist).
- [ ] Step 3: In `schema.ts`, add to migration runner:
  ```sql
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    embedding BLOB,
    parent_id TEXT REFERENCES goals(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_id);
  ```
- [ ] Step 4: Run test → expect pass.
- [ ] Step 5: `git add electron/memory/schema.ts test/memory/schema.test.ts && git commit -m "feat(memory): add goals table to memory schema"`

---

### Task 2: Add GoalAligner service

**Files:**
- Create `electron/memory/GoalAligner.ts`
- Create `test/memory/GoalAligner.test.ts`

- [ ] Step 1: Write `test/memory/GoalAligner.test.ts` with two cases:
  - Case A: 3 goals in DB, 3 action items where 2 have cosine > 0.65 and 1 has cosine 0.3 → assert 2 tagged, 1 has `goal_id: null`.
  - Case B: empty goals table → all items return `goal_id: null`, function exits without error.
  Stub `MemoryManager.queryVector` to return deterministic results (fixed float32 similarity scores).
- [ ] Step 2: Run `npx vitest run test/memory/GoalAligner.test.ts` → expect failure (file doesn't exist).
- [ ] Step 3: Create `electron/memory/GoalAligner.ts`:
  ```typescript
  import { MemoryManager } from './MemoryManager';
  import { EmbeddingPipeline } from './EmbeddingPipeline';

  export interface TaggedActionItem {
    text: string;
    goal_id: string | null;
    goal_confidence: number | null;
  }

  const GOAL_CONFIDENCE_THRESHOLD = 0.65;

  export class GoalAligner {
    constructor(
      private memoryManager: MemoryManager,
      private embeddingPipeline: EmbeddingPipeline
    ) {}

    async alignActionItems(items: string[], meetingId: string): Promise<TaggedActionItem[]> {
      const goalCount = this.memoryManager.countNodes('goal');
      if (goalCount === 0) {
        return items.map(text => ({ text, goal_id: null, goal_confidence: null }));
      }
      return Promise.all(items.map(async (text) => {
        const embedding = await this.embeddingPipeline.embed(text);
        const results = this.memoryManager.queryVector(embedding, 1, 'goal');
        if (results.length === 0 || results[0].score < GOAL_CONFIDENCE_THRESHOLD) {
          return { text, goal_id: null, goal_confidence: null };
        }
        return { text, goal_id: results[0].id, goal_confidence: results[0].score };
      }));
    }
  }
  ```
- [ ] Step 4: Run `npx vitest run test/memory/GoalAligner.test.ts` → expect pass.
- [ ] Step 5: `git add electron/memory/GoalAligner.ts test/memory/GoalAligner.test.ts && git commit -m "feat(memory): add GoalAligner for embedding-based action item tagging"`

---

### Task 3: Migrate ActionItem schema in DatabaseManager

**Files:**
- Modify `electron/db/DatabaseManager.ts`
- Modify `electron/db/seedDemo.ts`

- [ ] Step 1: Write `test/db/actionItemsMigration.test.ts` — load a snapshot DB with `actionItems: ["do X", "do Y"]` in `summary_json`, run migration, assert `actionItems: [{text: "do X", goal_id: null}, {text: "do Y", goal_id: null}]`.
- [ ] Step 2: Run test → expect failure.
- [ ] Step 3: In `DatabaseManager.ts`:
  - Update `Meeting` interface: `actionItems: ActionItem[]` where:
    ```typescript
    export interface ActionItem {
      text: string;
      goal_id?: string | null;
      goal_confidence?: number | null;
      speaker?: string;
      timestamp?: number;
      completed_at?: number | null;
    }
    ```
  - In `runMigrations`, add a one-time data migration that reads all meetings, converts `string[]` items to `ActionItem[]`, writes back.
  - Update `updateMeetingSummary` to accept `ActionItem[]` for `actionItems`.
- [ ] Step 4: Update `seedDemo.ts` so seeded action items use `ActionItem` format.
- [ ] Step 5: Run `npx vitest run test/db/actionItemsMigration.test.ts` → expect pass.
- [ ] Step 6: `git add electron/db/DatabaseManager.ts electron/db/seedDemo.ts test/db/actionItemsMigration.test.ts && git commit -m "feat(db): promote actionItems from string[] to ActionItem[] with goal_id"`

---

### Task 4: Wire GoalAligner into RecapLLM post-processing

**Files:**
- Modify `electron/llm/RecapLLM.ts`
- Modify `electron/ProcessingHelper.ts`

- [ ] Step 1: Write `test/llm/recapGoalTagging.test.ts` — stub GoalAligner to tag item[0] with `goal_id: "g1"`, run `RecapLLM.generate`, assert returned `actionItems[0].goal_id === "g1"`.
- [ ] Step 2: Run test → expect failure.
- [ ] Step 3: In `RecapLLM.ts`, add optional `goalAligner?: GoalAligner` to constructor. In `generate()`:
  ```typescript
  if (this.goalAligner && parsedItems.length > 0) {
    const tagged = await this.goalAligner.alignActionItems(
      parsedItems.map(i => i.text ?? i),
      meetingId
    );
    return { ...result, actionItems: tagged };
  }
  ```
- [ ] Step 4: In `ProcessingHelper.ts`, instantiate `GoalAligner` and inject into `RecapLLM` constructor.
- [ ] Step 5: Run `npx vitest run test/llm/recapGoalTagging.test.ts` → expect pass.
- [ ] Step 6: `git add electron/llm/RecapLLM.ts electron/ProcessingHelper.ts test/llm/recapGoalTagging.test.ts && git commit -m "feat(recap): auto-tag action items with goal_id via GoalAligner"`

---

### Task 5: Add GoalHintBuilder for pre-call open-commitments query

**Files:**
- Create `electron/memory/GoalHintBuilder.ts`
- Create `test/memory/GoalHintBuilder.test.ts`

- [ ] Step 1: Write test — insert 3 action items for goal "g1" (2 open, 1 completed); call `buildPreCallHint("g1")`; assert returns 2 rows, each with `text` and `meeting_id`, none with `completed_at` set.
- [ ] Step 2: Run test → expect failure.
- [ ] Step 3: Create `electron/memory/GoalHintBuilder.ts`:
  ```typescript
  import { DatabaseManager, ActionItem } from '../db/DatabaseManager';

  export interface OpenCommitment {
    text: string;
    meeting_id: string;
    goal_id: string;
    meeting_date: string;
  }

  export class GoalHintBuilder {
    constructor(private db: DatabaseManager) {}

    buildPreCallHint(goalId: string): OpenCommitment[] {
      return this.db.getOpenActionItemsByGoal(goalId);
    }
  }
  ```
- [ ] Step 4: Add `getOpenActionItemsByGoal(goalId: string): OpenCommitment[]` to `DatabaseManager.ts` — iterates meetings, filters `actionItems` where `goal_id === goalId && !completed_at`.
- [ ] Step 5: Run test → expect pass.
- [ ] Step 6: `git add electron/memory/GoalHintBuilder.ts electron/db/DatabaseManager.ts test/memory/GoalHintBuilder.test.ts && git commit -m "feat(memory): add GoalHintBuilder for pre-call open commitments"`

---

### Task 6: Expose goal management via IPC

**Files:**
- Modify `electron/ipcHandlers.ts`
- Modify `electron/preload.ts`

- [ ] Step 1: Write `test/ipc/goalHandlers.test.ts` — mock `MemoryManager`, call `goal:create` with `{title: "Ship RAG", description: "..."}`, assert handler calls `upsertNode` and returns `{id, title}`. Call `goal:list`, assert returns array. Call `goal:complete` with id, assert `completed_at` is set.
- [ ] Step 2: Run test → expect failure.
- [ ] Step 3: In `ipcHandlers.ts` add:
  ```typescript
  ipcMain.handle('goal:create', async (_, { title, description, parent_id }) => {
    const id = crypto.randomUUID();
    const embedding = await embeddingPipeline.embed(`${title} ${description}`);
    memoryManager.upsertNode({ id, type: 'goal', label: title, embedding });
    db.run(`INSERT INTO goals(id,title,description,embedding,parent_id) VALUES(?,?,?,?,?)`,
      [id, title, description ?? '', Buffer.from(new Float32Array(embedding).buffer), parent_id ?? null]);
    return { id, title };
  });

  ipcMain.handle('goal:list', async () => {
    return db.all(`SELECT id, title, description, parent_id, completed_at FROM goals ORDER BY created_at`);
  });

  ipcMain.handle('goal:complete', async (_, id: string) => {
    db.run(`UPDATE goals SET completed_at = unixepoch() WHERE id = ?`, [id]);
  });
  ```
- [ ] Step 4: Expose `goalCreate`, `goalList`, `goalComplete` in `preload.ts` under `window.electronAPI`.
- [ ] Step 5: Run `npx vitest run test/ipc/goalHandlers.test.ts` → expect pass.
- [ ] Step 6: `git add electron/ipcHandlers.ts electron/preload.ts test/ipc/goalHandlers.test.ts && git commit -m "feat(ipc): expose goal:create, goal:list, goal:complete handlers"`

---

### Task 7: End-to-end smoke test

**Files:**
- Create `test/e2e/goalAlignment.e2e.test.ts`

- [ ] Step 1: Write test that:
  1. Creates goal "Deploy local RAG" via IPC.
  2. Runs `GoalAligner.alignActionItems(["index the git repo"], meetingId)`.
  3. Asserts returned item has `goal_id` matching the created goal's id and `goal_confidence > 0.65`.
  4. Calls `GoalHintBuilder.buildPreCallHint(goalId)` — asserts 1 open commitment returned.
- [ ] Step 2: Run `npx vitest run test/e2e/goalAlignment.e2e.test.ts` → expect pass.
- [ ] Step 3: `git add test/e2e/goalAlignment.e2e.test.ts && git commit -m "test(e2e): goal alignment smoke test"`
