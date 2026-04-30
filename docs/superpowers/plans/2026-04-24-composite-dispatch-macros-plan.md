> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Implement Per-Workspace Dispatch Macros: observe meeting repetition → propose macro after 2nd same-type meeting → store confirmed macro → pre-configure pipeline on subsequent matches (template + prior context injection + dispatch target) — with human approval gate intact and a per-meeting override escape hatch.

**Architecture:** MacroLearner (observer) → MacroProposalCard (tray UI) → IPC confirm → dispatch_macros table → MacroRunner (pre-configure pipeline) → CrossSessionContextInjector (top-K prior decisions from ledger) → PostMeetingProcessor receives MacroContext.

**Tech Stack:** TypeScript · SQLite (better-sqlite3) · React · Electron IPC

---

### Task 1: dispatch_macros schema

**Files:**
- Create `src/db/migrations/006_dispatch_macros.sql`
- Modify `src/db/schema.ts`

- [ ] Step 1: Write migration SQL:
  ```sql
  CREATE TABLE IF NOT EXISTS dispatch_macros (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id          TEXT NOT NULL,
    meeting_type        TEXT NOT NULL,
    template_id         TEXT NOT NULL,
    prior_context_count INTEGER DEFAULT 3,
    dispatch_target     TEXT NOT NULL,
    active              INTEGER DEFAULT 1,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, meeting_type)
  );
  ```
- [ ] Step 2: Register migration in `src/db/schema.ts`.
- [ ] Step 3: Write test — run migration on in-memory SQLite; assert table exists with UNIQUE constraint.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(db): add dispatch_macros table`

---

### Task 2: MacroLearner

**Files:**
- Create `src/services/MacroLearner.ts`
- Create `src/services/__tests__/MacroLearner.test.ts`

- [ ] Step 1: Write failing test — given 2 completed meetings with same `project_id='finbiz'` and `meeting_type='weekly-sync'`, `MacroLearner.evaluate(meetingId)` returns a `MacroProposal` object.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `MacroLearner.evaluate(meetingId: string): MacroProposal | null`:
  - Load meeting metadata from meetings table.
  - Query: `SELECT COUNT(*) FROM meetings WHERE project_id=? AND meeting_type=? AND id != ?`.
  - If count == 1 (this is the 2nd) AND no macro exists in `dispatch_macros` for this project+type: return `MacroProposal`.
  - Otherwise return null.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — 3rd meeting of same type with existing macro returns null (no re-proposal).
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Write test — 1st meeting (count == 0) returns null.
- [ ] Step 8: Run test — expect pass.
- [ ] Step 9: Commit — `feat(macros): implement MacroLearner with 2-meeting trigger threshold`

---

### Task 3: CrossSessionContextInjector

**Files:**
- Create `src/services/CrossSessionContextInjector.ts`
- Create `src/services/__tests__/CrossSessionContextInjector.test.ts`

- [ ] Step 1: Write failing test — given `project_id` and `meeting_type`, injector queries LedgerQueryService and returns top-3 decisions with `{ text, speaker, timestamp, meeting_id }` provenance.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `CrossSessionContextInjector.inject(projectId, meetingType, topK = 3): InjectedContext`:
  ```typescript
  const recentDecisions = ledgerQuery.queryOpenCommitments(undefined, thirtyDaysAgo)
    .filter(d => d.project_id === projectId)
    .slice(0, topK);
  return { decisions: recentDecisions, injectedMeetingIds: [...new Set(recentDecisions.map(d => d.meeting_id))] };
  ```
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — injected context includes `injectedMeetingIds` for provenance audit.
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Commit — `feat(context): implement CrossSessionContextInjector with ledger-backed prior decisions`

---

### Task 4: MacroRunner

**Files:**
- Create `src/services/MacroRunner.ts`
- Create `src/services/__tests__/MacroRunner.test.ts`

- [ ] Step 1: Write failing test — given a saved macro `{templateId: 'client-sync', prior_context_count: 3, dispatch_target: 'finbiz-archon'}`, `MacroRunner.run(macro, meetingId)` returns a `MacroContext` with `templateId`, `priorDecisions` (length ≤ 3), and `dispatchTarget`.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `MacroRunner.run(macro, meetingId): MacroContext`:
  ```typescript
  const injected = crossSessionInjector.inject(macro.project_id, macro.meeting_type, macro.prior_context_count);
  return { templateId: macro.template_id, priorDecisions: injected.decisions, dispatchTarget: macro.dispatch_target, injectedMeetingIds: injected.injectedMeetingIds };
  ```
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(macros): implement MacroRunner returning MacroContext`

---

### Task 5: MacroProposalCard UI + IPC handlers

**Files:**
- Create `src/components/MacroProposalCard.tsx`
- Create `src/components/__tests__/MacroProposalCard.test.tsx`
- Create `src/ipc/macroHandlers.ts`
- Modify `src/ipc/index.ts`

- [ ] Step 1: Write failing render test — `MacroProposalCard` with proposal `{projectId, meetingType, templateId}` renders: description text, "Save Macro" button, "Not now" button.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `MacroProposalCard`:
  ```tsx
  export function MacroProposalCard({ proposal, onConfirm, onDismiss }: Props) {
    return (
      <div className="macro-proposal-card">
        <p>We noticed 2 <strong>{proposal.meetingType}</strong> meetings for <strong>{proposal.projectId}</strong>.</p>
        <p>Save this pipeline config as a macro? Template: {proposal.templateId}</p>
        <button onClick={onConfirm}>Save Macro</button>
        <button onClick={onDismiss}>Not now</button>
      </div>
    );
  }
  ```
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Implement `macroHandlers.ts`:
  ```typescript
  ipcMain.handle('macro:confirm', async (_, { proposal }) => {
    db.prepare(`INSERT OR IGNORE INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target)
      VALUES (?, ?, ?, ?)`).run(proposal.projectId, proposal.meetingType, proposal.templateId, proposal.dispatchTarget);
  });
  ipcMain.handle('macro:dismiss', async () => { /* no-op for now */ });
  ipcMain.handle('macro:override', async (_, { meetingId }) => {
    // Mark this meeting as manual-override in a per-meeting flag column or in-memory map
  });
  ```
- [ ] Step 6: Register handlers in `src/ipc/index.ts`.
- [ ] Step 7: Commit — `feat(ui,ipc): add MacroProposalCard and macro IPC handlers`

---

### Task 6: Wire into PostMeetingProcessor

**Files:**
- Modify `src/services/PostMeetingProcessor.ts`
- Modify `src/services/__tests__/PostMeetingProcessor.test.ts`

- [ ] Step 1: At start of `PostMeetingProcessor.run(transcript, meetingId)`: check `dispatch_macros` for an active macro matching `project_id + meeting_type`. If found and no override flag: call `MacroRunner.run(macro, meetingId)` → `MacroContext`. Pass `MacroContext.templateId` to WorkflowClassifier as a forced template; prepend `MacroContext.priorDecisions` to LLM context.
- [ ] Step 2: After processing: call `MacroLearner.evaluate(meetingId)`. If proposal returned, push `macro:proposal` IPC event to renderer.
- [ ] Step 3: Write test — fixture with existing macro; assert `templateId` pre-set in pipeline, prior decisions count ≤ 3 in context.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — no macro found; pipeline runs in standard manual mode (MacroRunner not called).
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Commit — `feat(pipeline): wire MacroRunner and MacroLearner into PostMeetingProcessor`

---

### Task 7: Override + audit integration test

**Files:**
- Create `src/__tests__/integration/dispatchMacros.test.ts`

- [ ] Step 1: Write integration test:
  - Seed 2 finbiz/weekly-sync meetings.
  - Run `PostMeetingProcessor` on 3rd meeting → assert `macro:proposal` NOT emitted (macro already exists).
  - Assert MacroRunner called with correct macro.
  - Call `macro:override` IPC → run pipeline again → assert MacroRunner NOT called (manual mode).
- [ ] Step 2: Run test — expect pass.
- [ ] Step 3: Commit — `test(macros): add end-to-end dispatch macro integration test`
