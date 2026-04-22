import { describe, it, expect } from 'vitest'
import type {
  HermesEventMap,
  HermesEventName,
  HermesHandler,
  HandlerDescriptor,
  MeetingStartedPayload,
  MeetingEndedPayload,
  EmailContextPayload,
  CalendarEventPayload,
  CredentialsChangedPayload,
  WindowStatePayload,
} from '../types'

describe('Hermes types', () => {
  it('HermesEventName covers all declared events', () => {
    // Type-level assertion: every key of HermesEventMap is assignable to HermesEventName
    const events: HermesEventName[] = [
      'hermes:meeting-started',
      'hermes:meeting-ended',
      'hermes:email-context',
      'hermes:calendar-event',
      'hermes:credentials-changed',
      'hermes:window-state',
    ]
    expect(events).toHaveLength(6)
  })

  it('MeetingStartedPayload has required fields', () => {
    const payload: MeetingStartedPayload = {
      meetingId: 'abc',
      title: 'Standup',
      source: 'calendar',
    }
    expect(payload.meetingId).toBe('abc')
    expect(payload.source).toBe('calendar')
  })

  it('MeetingStartedPayload accepts optional calendarEventId', () => {
    const payload: MeetingStartedPayload = {
      meetingId: 'abc',
      title: 'Standup',
      source: 'calendar',
      calendarEventId: 'evt-1',
    }
    expect(payload.calendarEventId).toBe('evt-1')
  })

  it('MeetingEndedPayload has required fields', () => {
    const payload: MeetingEndedPayload = {
      meetingId: 'abc',
      durationMs: 3600000,
    }
    expect(payload.durationMs).toBe(3600000)
  })

  it('EmailContextPayload has required fields', () => {
    const payload: EmailContextPayload = {
      attendeeEmails: ['a@b.com'],
    }
    expect(payload.attendeeEmails).toHaveLength(1)
  })

  it('CalendarEventPayload has required fields', () => {
    const payload: CalendarEventPayload = {
      eventId: 'e1',
      title: 'Sync',
      startTime: '2026-04-22T10:00:00Z',
      attendees: ['a@b.com'],
    }
    expect(payload.eventId).toBe('e1')
  })

  it('CredentialsChangedPayload has required fields', () => {
    const payload: CredentialsChangedPayload = {
      provider: 'openai',
    }
    expect(payload.provider).toBe('openai')
  })

  it('WindowStatePayload has required fields', () => {
    const payload: WindowStatePayload = {
      windowId: 'main',
      state: 'focused',
    }
    expect(payload.state).toBe('focused')
  })

  it('HermesHandler type accepts sync and async functions', () => {
    const syncHandler: HermesHandler<'hermes:meeting-started'> = (_payload) => {
      // sync — returns void
    }
    const asyncHandler: HermesHandler<'hermes:meeting-started'> = async (_payload) => {
      // async — returns Promise<void>
    }
    expect(syncHandler).toBeDefined()
    expect(asyncHandler).toBeDefined()
  })

  it('HandlerDescriptor binds event name to correct payload type', () => {
    const descriptor: HandlerDescriptor<'hermes:meeting-started'> = {
      id: 'test-handler',
      event: 'hermes:meeting-started',
      handle: (payload) => {
        // Type-safe: payload is MeetingStartedPayload
        void payload.meetingId
        void payload.title
        void payload.source
      },
    }
    expect(descriptor.id).toBe('test-handler')
    expect(descriptor.event).toBe('hermes:meeting-started')
  })
})
