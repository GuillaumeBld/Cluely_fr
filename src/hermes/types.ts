/**
 * Hermes Event Types
 *
 * Typed event definitions for the Hermes in-process orchestrator.
 * Hermes observes only data Cluely already holds (Interpretation A — ADR-001).
 */

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface MeetingStartedPayload {
  meetingId: string
  title: string
  source: 'calendar' | 'manual' | 'launcher'
  calendarEventId?: string
}

export interface MeetingEndedPayload {
  meetingId: string
  durationMs: number
}

export interface EmailContextPayload {
  attendeeEmails: string[]
  meetingId?: string
}

export interface CalendarEventPayload {
  eventId: string
  title: string
  startTime: string
  attendees: string[]
}

export interface CredentialsChangedPayload {
  provider: string
}

export interface WindowStatePayload {
  windowId: string
  state: 'shown' | 'hidden' | 'focused' | 'blurred'
}

// ---------------------------------------------------------------------------
// Event map — single source of truth for all hermes events
// ---------------------------------------------------------------------------

export interface HermesEventMap {
  'hermes:meeting-started': MeetingStartedPayload
  'hermes:meeting-ended': MeetingEndedPayload
  'hermes:email-context': EmailContextPayload
  'hermes:calendar-event': CalendarEventPayload
  'hermes:credentials-changed': CredentialsChangedPayload
  'hermes:window-state': WindowStatePayload
}

export type HermesEventName = keyof HermesEventMap

// ---------------------------------------------------------------------------
// Handler signature
// ---------------------------------------------------------------------------

export type HermesHandler<E extends HermesEventName = HermesEventName> = (
  payload: HermesEventMap[E],
) => void | Promise<void>

// ---------------------------------------------------------------------------
// Handler registration descriptor
// ---------------------------------------------------------------------------

export interface HandlerDescriptor<E extends HermesEventName = HermesEventName> {
  /** Unique identifier for this handler (for logging / debugging) */
  id: string
  /** The event this handler subscribes to */
  event: E
  /** The handler function */
  handle: HermesHandler<E>
}
