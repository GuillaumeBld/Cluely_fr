# Composite B — Zero-Touch Pre-Meeting Context Loader

**Source issues:** #6 (Attendee Intelligence), #17 (Cross-Session Background Agent), #20 (Project Context Switcher → Calendar Auto-Load), #21 (Meeting-Type Templates)

---

## Problem & goal

Four issues independently propose "before a meeting, do X": load attendee profiles (#6), poll calendar (#17), switch project context (#20), select an extraction template (#21). Shipped separately they require four triggers, four background loops, and will silently conflict. The goal is a single orchestrated pre-meeting pipeline: one calendar daemon fires 5 minutes before each event, resolves the project, assembles an attendee brief, and locks in the extraction template — all without Guillaume typing anything.

---

## User story

As Guillaume, when my calendar shows a meeting starting in 5 minutes, I see a pre-brief card appear in the Launcher banner showing attendees, relevant prior decisions, open action items, and the detected meeting template — with zero interaction required.

---

## Architecture

A `PreMeetingOrchestrator` runs as a singleton in the main process, started at app launch. It polls upcoming calendar events every 60 seconds and fires a pipeline exactly once per event at `T-5min`. The pipeline is a sequential chain: `ProjectResolver` → `TemplateClassifier` → `AttendeeProfiler` → `PreBriefComposer`. The composed brief is pushed to the renderer via IPC (`pre-meeting:brief-ready`). The orchestrator self-pauses while a Zoom session is active (detected via `ZoomWatcher`) to avoid redundant polling.

---

## Components

| File | Responsibility |
|------|---------------|
| `electron/services/PreMeetingOrchestrator.ts` | Singleton; owns the 60s poll loop, deduplication (`firedEventIds` Set), and pipeline invocation |
| `electron/services/ProjectResolver.ts` | Maps a calendar event title + attendee list to an active project via fuzzy string match against a config map; falls back to "unknown" |
| `electron/services/TemplateClassifier.ts` | Keyword-based classifier (no LLM): maps event title tokens → template ID (standup, one-on-one, sales, kickoff, default) using a lookup table + attendee-count heuristics |
| `electron/services/AttendeeProfiler.ts` | Per-attendee: queries `EmailManager` for recent threads; queries memory graph (if Composite A is live) for open items and prior decisions; falls back to email-only |
| `electron/services/PreBriefComposer.ts` | Assembles structured `PreBrief` object from resolver/classifier/profiler outputs; keeps rendering logic out of the orchestrator |
| `electron/ipcHandlers.ts` | Adds handler for `pre-meeting:get-brief` renderer pull; emits `pre-meeting:brief-ready` push |
| `src/components/Launcher/PreBriefBanner.tsx` | Renders the brief card in the Launcher (dismissable; auto-hides at meeting start) |

---

## Data flow

```
CalendarManager.fetchUpcomingEvents()
  → filter events starting in [4, 6] min window
  → dedup against firedEventIds
  → ProjectResolver.resolve(event) → projectId
  → TemplateClassifier.classify(event) → templateId
  → AttendeeProfiler.profile(attendeeEmails) → AttendeeProfile[]
  → PreBriefComposer.compose(...) → PreBrief
  → ipcMain.emit('pre-meeting:brief-ready', preBrief)
  → PreBriefBanner renders in Launcher
```

`PreBrief` shape:
```ts
interface PreBrief {
  eventId: string;
  eventTitle: string;
  startsAt: string;       // ISO
  projectId: string | null;
  templateId: string;
  attendees: AttendeeProfile[];
  firedAt: number;        // epoch ms
}

interface AttendeeProfile {
  email: string;
  recentEmails: EmailMessage[];       // last 5
  openItems: string[];                // from memory graph or []
  priorDecisions: string[];           // from memory graph or []
}
```

---

## Error handling

- `ProjectResolver` never throws; returns `{ projectId: null, confidence: 0 }` on no match.
- `TemplateClassifier` always returns a valid template ID; "default" is the fallback.
- `AttendeeProfiler` catches per-attendee errors individually; partial results are still returned.
- If the orchestrator poll fails, the error is logged and the next tick retries — no crash.
- If memory graph is not available (Composite A not yet live), `AttendeeProfiler` silently uses email-only mode.

---

## Testing approach

- Unit test `TemplateClassifier` with a fixture table of event title strings → expected template IDs.
- Unit test `ProjectResolver` with mock project config map and sample calendar events.
- Unit test `PreBriefComposer` with stub inputs, asserting `PreBrief` shape.
- Integration test: inject a mock calendar event starting in 4 minutes, assert `pre-meeting:brief-ready` IPC event fires with correct fields within 70 seconds.
- Negative test: same event ID fired twice — assert orchestrator emits only once.

---

## Success criteria

1. A calendar event starting in 5 ± 1 minutes triggers `pre-meeting:brief-ready` IPC event with non-null `templateId` and `attendees` array.
2. `TemplateClassifier` correctly identifies template for "standup", "1:1", "kickoff", "sales call", and "review" event titles without LLM.
3. `ProjectResolver` resolves correctly for at least 2 configured projects by fuzzy title match.
4. Pre-brief card appears in Launcher without any user interaction.
5. No duplicate brief fires for the same event ID within a session.
6. Orchestrator poll loop is suspended while `ZoomWatcher.isActive()` returns true.
