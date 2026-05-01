# Hermes — Developer Guide

Hermes is a thin, in-process event orchestrator for Cluely. It coordinates features that need to react to application events without coupling them directly.

**Scope**: Interpretation A — Inner Cluely Operator (see [ADR-001](../../docs/decisions/ADR-001-hermes-scope.md))

## Quick Start

Register a handler in 3 lines:

```ts
import { HermesCore } from '../hermes'

const hermes = HermesCore.getInstance()

hermes.on('hermes:meeting-started', {
  id: 'my-feature',
  handle: (payload) => {
    console.log(`Meeting "${payload.title}" started`)
  },
})
```

## Architecture

```
┌──────────────────────────────────────────────┐
│  Electron Main Process                       │
│                                              │
│  ┌────────────┐    emit()    ┌────────────┐  │
│  │  Services   │───────────▶│  HermesCore  │  │
│  │ (Calendar,  │            │              │  │
│  │  Email,     │            │  ┌────────┐  │  │
│  │  IPC, ...)  │            │  │Registry│  │  │
│  └────────────┘            │  └────────┘  │  │
│                             │      │       │  │
│                             │  dispatch()  │  │
│                             │      │       │  │
│                             │  ┌───▼────┐  │  │
│                             │  │Handlers│  │  │
│                             │  └────────┘  │  │
│                             └────────────┘  │
└──────────────────────────────────────────────┘
```

## Available Events

| Event | Payload | When |
|-------|---------|------|
| `hermes:meeting-started` | `MeetingStartedPayload` | User starts a meeting |
| `hermes:meeting-ended` | `MeetingEndedPayload` | Meeting ends |
| `hermes:email-context` | `EmailContextPayload` | Email context loaded for attendees |
| `hermes:calendar-event` | `CalendarEventPayload` | Calendar event detected |
| `hermes:credentials-changed` | `CredentialsChangedPayload` | API credentials updated |
| `hermes:window-state` | `WindowStatePayload` | Window shown/hidden/focused/blurred |

See `src/hermes/types.ts` for full type definitions.

## Writing a Handler

### Rules

1. **Handlers must be independent** — do not read another handler's state directly
2. **Handlers must not throw** — Hermes catches exceptions, but write defensively
3. **Use the `id` field** — it appears in logs when your handler throws

### Sync or Async

Handlers can be synchronous or asynchronous. Hermes runs all handlers for an event concurrently via `Promise.allSettled`.

```ts
// Sync
hermes.on('hermes:meeting-ended', {
  id: 'analytics',
  handle: (payload) => {
    trackEvent('meeting_ended', { duration: payload.durationMs })
  },
})

// Async
hermes.on('hermes:meeting-ended', {
  id: 'cleanup',
  handle: async (payload) => {
    await cleanupMeetingResources(payload.meetingId)
  },
})
```

### Unsubscribing

`hermes.on()` returns an unsubscribe function:

```ts
const unsub = hermes.on('hermes:meeting-started', {
  id: 'temp-logger',
  handle: (payload) => console.log(payload),
})

// Later:
unsub()
```

## Emitting Events

Services that produce events call `hermes.emit()`:

```ts
import { HermesCore } from '../hermes'

const hermes = HermesCore.getInstance()

await hermes.emit('hermes:meeting-started', {
  meetingId: '123',
  title: 'Team Sync',
  source: 'calendar',
  calendarEventId: 'cal-456',
})
```

## Adding a New Event Type

1. Add the payload interface to `src/hermes/types.ts`
2. Add the event to `HermesEventMap`
3. Emit the event from the relevant service
4. Write a test in `src/hermes/__tests__/`

## Scope Boundaries

Hermes **only** observes data Cluely already holds:
- IPC messages from the renderer
- Service callbacks (Calendar, Email, etc.)
- App state changes

Hermes does **NOT**:
- Monitor other macOS applications
- Access the clipboard or screen
- Scan the filesystem outside app data
- Introduce new persistence

To expand scope, propose an amendment to [ADR-001](../../docs/decisions/ADR-001-hermes-scope.md).
