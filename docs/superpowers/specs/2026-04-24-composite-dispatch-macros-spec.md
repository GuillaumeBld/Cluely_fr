# Composite E — Per-Workspace Dispatch Macros

**Source issues:** #21 (Meeting-Type Templates) + #25 (reshaped: Pipeline Macros) + #7 (reshaped: Silent Context Injection)

## Problem & goal

For recurring meetings of the same type (weekly client sync, daily standup), the user must re-configure the same pipeline parameters every time: which template to use, which project to attach, how many prior meetings of context to inject. Composite E encodes the full post-meeting pipeline as a macro after two same-type meetings are observed. Subsequent meetings of that type trigger the macro silently — Guillaume still approves action items, but the pipeline pre-configures itself with zero interaction.

## User story

After two Finbiz weekly syncs, a macro proposal appears in the approval tray: "We noticed 2 Finbiz Weekly meetings — save this pipeline config as a macro?" One tap confirms. From that point forward, every Finbiz weekly sync auto-selects the client-sync template, injects decisions from the 3 most similar prior Finbiz meetings, and dispatches to the Finbiz Archon workspace — without Guillaume lifting a finger before the approval step.

## Architecture

A `MacroLearner` service observes completed meetings, detects repetition (same project_id + same meeting_type, ≥ 2 occurrences), and surfaces a macro proposal in the tray. A confirmed macro is stored in `dispatch_macros` SQLite table. On subsequent matching meetings, `MacroRunner` reads the macro and pre-configures the full pipeline: template selection, context injection (top-K decisions from prior matching meetings via LedgerQueryService), and dispatch target. The human approval gate remains intact — the macro pre-configures, not pre-executes. A per-meeting "override" button in the tray resets to manual mode for edge cases.

**Dependencies:** #15 (ApprovalTray), Composite B (pre-meeting pipeline), Composite D (LedgerQueryService for prior decisions).

## Components (per-file responsibilities)

- `src/services/MacroLearner.ts` — After each meeting: count same-type+project meetings; if count == 2, propose macro. Checks `dispatch_macros` for existing macro before proposing.
- `src/services/MacroRunner.ts` — Given a macro, pre-configures `PostMeetingProcessor` context: set templateId, attach top-K prior decisions from ledger, set dispatch target. Returns a `MacroContext`.
- `src/services/CrossSessionContextInjector.ts` — (from #7 reshaped) Given meeting metadata, query LedgerQueryService for top-K decisions from similar prior meetings (matched by project_id + meeting_type); returns injection payload with source meeting provenance.
- `src/db/migrations/006_dispatch_macros.sql` — `dispatch_macros` table.
- `src/components/MacroProposalCard.tsx` — Tray card: "Save as macro?" with one-click confirm, preview of what will be automated, and "Not now" dismiss.
- `src/ipc/macroHandlers.ts` — IPC handlers: `macro:confirm`, `macro:dismiss`, `macro:override` (per-meeting manual reset).

## Data model

```sql
CREATE TABLE dispatch_macros (
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

## Error handling

- Macro misfire (wrong meeting type): "This meeting is different" override button in tray resets pipeline to manual mode for that meeting only.
- Macro not found at meeting start: falls through to standard manual pipeline silently.
- MacroLearner counts: if a same-type meeting already has a macro, no re-proposal.
- Context injection false positive guard: injected prior meetings logged in `MacroContext.injectedMeetingIds` for auditing in tray.

## Testing approach

- Unit: `MacroLearner` with fixture meetings; assert proposal triggered on exactly the 2nd same-type meeting.
- Unit: `MacroRunner` with a saved macro; assert returned `MacroContext` has correct templateId, prior decisions count, dispatch target.
- Unit: `CrossSessionContextInjector` with mocked LedgerQueryService; assert top-K decisions returned with provenance metadata.
- Integration: full pipeline using a macro — assert template pre-selected, context injected, tray receives pre-configured drafts.

## Success criteria

- Macro proposed after exactly 2 same-type meetings in the same project (not before, not later).
- Macro pre-configures pipeline without any user interaction before the approval step.
- Injected prior context includes provenance (source meeting_id + timestamp) visible in tray.
- "Override" button available on every macro-driven meeting; toggling it resets to manual for that meeting only.
- Approval gate remains intact — no dispatch happens without user action.
