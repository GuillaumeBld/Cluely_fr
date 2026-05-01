> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Implement the full approve-gate loop: meeting transcript → action item extraction → workflow classification → structured draft with KB citations → ApprovalTray → Archon dispatch. All within the Electron app, no external redirects.

**Architecture:** Post-meeting trigger → RecapLLM → WorkflowClassifier → WorkflowDrafter → IPC push → ApprovalTray React UI → approval IPC handler → ArchonDispatcher → DecisionLedger write.

**Tech Stack:** TypeScript · Electron IPC · React · Claude API (extraction, classification, drafting) · cosine-similarity · SQLite (better-sqlite3) · Archon job API

---

### Task 1: Workflow Template Registry

**Files:**
- Create `src/services/WorkflowTemplateRegistry.ts`
- Create `src/data/workflowTemplates.json`
- Create `src/services/__tests__/WorkflowTemplateRegistry.test.ts`

- [ ] Step 1: Write failing test — `registry.getAll()` returns an array of templates, each with `id`, `name`, `description`, `embeddingSeed` fields.
- [ ] Step 2: Define `workflowTemplates.json` with at minimum 5 templates: `code-task`, `research-task`, `follow-up-email`, `meeting-schedule`, `document-update`. Each has a description used for embedding.
- [ ] Step 3: Implement `WorkflowTemplateRegistry.ts` — loads JSON at import time, exposes `getAll()` and `getById(id)`.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Commit — `feat(workflows): add WorkflowTemplateRegistry with initial 5 templates`

---

### Task 2: RecapLLM action item extractor

**Files:**
- Create `src/services/RecapLLM.ts`
- Create `src/services/__tests__/RecapLLM.test.ts`

- [ ] Step 1: Write failing test — given fixture transcript with 3 clear action items, `RecapLLM.extractActionItems(transcript)` returns 3 `ActionItem` objects each with `text`, `speaker`, `timestamp`, `rawExcerpt`.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `extractActionItems(transcript: string): Promise<ActionItem[]>` — Claude API call with prompt: _"Extract all action items from the transcript. For each, return: text (imperative sentence), speaker, timestamp (HH:MM), rawExcerpt (verbatim quote). Return JSON array."_ Parse and validate response.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — empty transcript returns empty array (no LLM call unnecessary error).
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Commit — `feat(recap): implement RecapLLM action item extractor`

---

### Task 3: WorkflowClassifier

**Files:**
- Create `src/services/WorkflowClassifier.ts`
- Create `src/services/__tests__/WorkflowClassifier.test.ts`

- [ ] Step 1: Write failing test — "Write unit tests for the auth service" action item classifies to `code-task` template with confidence > 0.7.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `classify(item: ActionItem): Promise<{templateId: string, confidence: number}>` — embed item.text via Claude embedding endpoint, cosine-compare against pre-embedded template seeds (cache embeddings at startup), return highest match + score.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — item with confidence < 0.5 returns `templateId: 'unknown'` and `confidence < 0.5`.
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Commit — `feat(workflows): implement WorkflowClassifier with embedding similarity`

---

### Task 4: WorkflowDrafter

**Files:**
- Create `src/services/WorkflowDrafter.ts`
- Create `src/services/__tests__/WorkflowDrafter.test.ts`

- [ ] Step 1: Write failing test — given an action item + templateId `code-task` + mocked KB returning 2 citations, `draft()` returns a `WorkflowDraft` with `kbCitations.length === 2` and a non-empty `goalTag`.
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `draft(item: ActionItem, templateId: string): Promise<WorkflowDraft>`:
  - Call KB RAG (issue #22 service) for top-3 citations matching item.text.
  - Call GoalAligner (issue #13 service) to get goalTag.
  - Call Claude to compose Archon job payload using template schema.
  - Return `WorkflowDraft { templateId, confidence, payload, kbCitations, goalTag, rawExcerpt, speaker, timestamp }`.
- [ ] Step 4: Run test — expect pass.
- [ ] Step 5: Write test — when KB returns 0 citations, draft still returns but `kbCitations` is empty array (not null).
- [ ] Step 6: Run test — expect pass.
- [ ] Step 7: Commit — `feat(workflows): implement WorkflowDrafter with KB citation injection`

---

### Task 5: ApprovalTray + WorkflowCard UI

**Files:**
- Create `src/components/ApprovalTray.tsx`
- Create `src/components/WorkflowCard.tsx`
- Create `src/components/__tests__/WorkflowCard.test.tsx`

- [ ] Step 1: Write failing render test — `WorkflowCard` with a normal draft renders: task text, template badge, confidence percentage, KB citation list, and three buttons: "Preview", "Approve", "Dismiss".
- [ ] Step 2: Run test — expect failure.
- [ ] Step 3: Implement `WorkflowCard`:
  ```tsx
  export function WorkflowCard({ draft, onApprove, onDismiss, onEdit }: Props) {
    const [confirming, setConfirming] = useState(false);
    return (
      <div className={`workflow-card ${draft.confidence < 0.5 ? 'low-confidence' : ''}`}>
        <p>{draft.payload.title}</p>
        <span className="template-badge">{draft.templateId}</span>
        <span className="confidence">{Math.round(draft.confidence * 100)}%</span>
        <ul>{draft.kbCitations.map(c => <li key={c.id}>{c.label}</li>)}</ul>
        <button onClick={onEdit}>Edit</button>
        <button onClick={() => { setConfirming(true); setTimeout(() => onApprove(), 3000); }}>
          {confirming ? 'Confirming...' : 'Approve'}
        </button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    );
  }
  ```
- [ ] Step 4: Write test — low-confidence card renders `low-confidence` CSS class and "Low Confidence" warning label.
- [ ] Step 5: Run tests — expect pass.
- [ ] Step 6: Implement `ApprovalTray.tsx` — listens to IPC `approval:drafts-ready` event, renders list of `WorkflowCard` components.
- [ ] Step 7: Commit — `feat(ui): add ApprovalTray and WorkflowCard components`

---

### Task 6: IPC handlers + ArchonDispatcher

**Files:**
- Create `src/ipc/approvalHandlers.ts`
- Create `src/services/ArchonDispatcher.ts`
- Create `src/services/__tests__/ArchonDispatcher.test.ts`
- Modify `src/ipc/index.ts`

- [ ] Step 1: Write failing test — `ArchonDispatcher.dispatch(draft)` calls Archon job creation API and returns `{ jobId: string }`.
- [ ] Step 2: Implement `ArchonDispatcher.ts` — HTTP POST to Archon job endpoint (configurable base URL from env). Return jobId from response.
- [ ] Step 3: Run test (mocked HTTP) — expect pass.
- [ ] Step 4: Write failing test — `approval:approve` IPC handler calls `ArchonDispatcher.dispatch()` and writes ledger entry via `DecisionLedger.appendDispatch({ meetingId, jobId, draftId })`.
- [ ] Step 5: Implement `approvalHandlers.ts`:
  ```typescript
  ipcMain.handle('approval:approve', async (_, { draft, meetingId }) => {
    const { jobId } = await archonDispatcher.dispatch(draft);
    await decisionLedger.appendDispatch({ meetingId, jobId, draftId: draft.id });
    return { jobId };
  });
  ipcMain.handle('approval:dismiss', async (_, { draftId, meetingId, reason }) => {
    await decisionLedger.appendDismissal({ meetingId, draftId, reason });
  });
  ```
- [ ] Step 6: Register handlers in `src/ipc/index.ts`.
- [ ] Step 7: Run test — expect pass.
- [ ] Step 8: Commit — `feat(ipc): add approval IPC handlers and ArchonDispatcher`

---

### Task 7: Post-meeting pipeline integration

**Files:**
- Modify `src/services/PostMeetingProcessor.ts`
- Create `src/__tests__/integration/approvalPipeline.test.ts`

- [ ] Step 1: In `PostMeetingProcessor.run(transcript, meetingId)`, add sequential steps after existing recap: `extractActionItems → classify each → draft each → push IPC 'approval:drafts-ready'`.
- [ ] Step 2: Write integration test — fixture transcript with 2 action items. Mock LLM calls with deterministic responses. Assert `approval:drafts-ready` event received by renderer mock within 5 seconds, with 2 draft objects.
- [ ] Step 3: Run test — expect pass.
- [ ] Step 4: Write performance guard test — assert pipeline completes in under 5 minutes for a 60-minute meeting transcript (mocked LLM responses, measure wall-clock).
- [ ] Step 5: Run test — expect pass.
- [ ] Step 6: Commit — `feat(pipeline): wire RecapLLM → classifier → drafter → ApprovalTray in PostMeetingProcessor`
