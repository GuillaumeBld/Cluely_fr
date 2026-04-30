# Action Items as Approval-Gated Workflows

## Problem & goal

After a meeting ends, extracted action items currently exist as prose. There is no mechanism to convert them into dispatched Archon jobs with human review. This feature closes the full loop: meeting transcript → action items → workflow draft → Guillaume reviews/edits → Archon dispatch — all within the app without leaving to another tool.

## User story

A meeting ends. Within 5 minutes, Guillaume sees an approval tray populated with structured workflow cards — one per action item. Each card shows the extracted task, the detected workflow type, a confidence score, and KB citations. Guillaume can Preview, Edit, Approve, or Dismiss each item. Approved items are dispatched as Archon jobs immediately. No action leaves the app.

## Architecture

A multi-step LLM pipeline runs post-meeting: `RecapLLM` extracts raw action items from the transcript; a `WorkflowClassifier` maps each item to a workflow type from a registry (using embedding similarity + confidence score); a per-type `WorkflowDrafter` generates the structured job payload with KB citations injected. Results are pushed to the `ApprovalTray` via IPC. User actions (approve/edit/dismiss) invoke Archon dispatch or record dismissals. Dependencies: Composite A (memory), issue #6 (attendees), issue #13 (goals), Composite C (#14 event bus).

## Components (per-file responsibilities)

- `src/services/RecapLLM.ts` — LLM call on full transcript; returns `ActionItem[]` with speaker attribution and timestamp.
- `src/services/WorkflowClassifier.ts` — Embeds each action item; cosine-matches against workflow template registry; returns `{templateId, confidence}`. Emits confidence in payload.
- `src/services/WorkflowDrafter.ts` — Per-template drafter: composes structured Archon job payload, queries KB for citations (#22), injects goal tag (#13), returns `WorkflowDraft`.
- `src/services/WorkflowTemplateRegistry.ts` — Static JSON registry of workflow types with embedding seeds; loaded at startup.
- `src/components/ApprovalTray.tsx` — Renders workflow cards; Preview/Edit/Approve/Dismiss actions; 3-second cooldown on destructive-action buttons (configurable).
- `src/components/WorkflowCard.tsx` — Per-item card: task text, template label, confidence badge, KB citation list, edit form.
- `src/ipc/approvalHandlers.ts` — IPC handlers: `approval:approve`, `approval:dismiss`, `approval:edit`. Approve triggers Archon job dispatch.
- `src/services/ArchonDispatcher.ts` — Thin wrapper around Archon job creation API; returns `jobId`.

## Data flow

1. Post-meeting trigger fires → `RecapLLM.extractActionItems(transcript)` → `ActionItem[]`.
2. Each item: `WorkflowClassifier.classify(item)` → `{templateId, confidence}`.
3. Each item: `WorkflowDrafter.draft(item, templateId)` → `WorkflowDraft` with KB citations and goal tag.
4. All drafts pushed via IPC to `ApprovalTray` renderer.
5. User action → IPC handler → `ArchonDispatcher.dispatch(draft)` or dismissal logged.
6. Dispatch result (jobId) written to DecisionLedger with meeting attribution.

## Error handling

- Classifier confidence < 0.5: draft flagged as "Low Confidence" in tray; user must manually select template before approving.
- Drafter LLM failure: card shown with error state; user can retry or dismiss.
- Archon dispatch failure: surface error inline on card; offer retry. Do not silently drop.
- Post-meeting pipeline latency > 5 min: warn in tray header but do not block display of partial results.

## Testing approach

- Unit: `RecapLLM` with fixture transcript; assert action items extracted with speaker + timestamp.
- Unit: `WorkflowClassifier` with known action items; assert correct template + confidence above threshold.
- Unit: `WorkflowDrafter` with mocked KB; assert KB citations present in payload.
- Integration: full pipeline on fixture transcript; assert tray receives N drafts within 5 minutes.
- UI: `WorkflowCard` render tests for each state (normal, low-confidence, error, edit mode).

## Success criteria

- All action items extracted from a meeting appear in the approval tray within 5 minutes of meeting end.
- Every workflow draft with a project reference includes at least one KB citation.
- Classifier confidence score is visible on every card.
- Approving a card dispatches an Archon job and writes a ledger entry within 2 seconds.
- The user never leaves the app to complete approve → dispatch → confirmation flow.
