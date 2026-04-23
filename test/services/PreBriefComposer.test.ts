import { describe, it, expect } from 'vitest';
import { PreBriefComposer } from '../../electron/services/PreBriefComposer';
import type { CalendarEvent } from '../../electron/services/CalendarManager';
import type { AttendeeProfile } from '../../electron/services/AttendeeProfiler';

describe('PreBriefComposer', () => {
  const composer = new PreBriefComposer();

  it('composes a PreBrief with correct fields', () => {
    const event: CalendarEvent = {
      id: 'evt-123',
      title: 'Sales call - Acme',
      startTime: '2026-04-22T14:00:00Z',
      endTime: '2026-04-22T15:00:00Z',
      source: 'google',
      attendees: ['alice@example.com'],
    };

    const profile: AttendeeProfile = {
      email: 'alice@example.com',
      recentEmails: [],
      openItems: [],
      priorDecisions: [],
    };

    const before = Date.now();
    const brief = composer.compose(event, 'finbiz', 'sales', [profile]);
    const after = Date.now();

    expect(brief.eventId).toBe('evt-123');
    expect(brief.eventTitle).toBe('Sales call - Acme');
    expect(brief.startsAt).toBe('2026-04-22T14:00:00Z');
    expect(brief.projectId).toBe('finbiz');
    expect(brief.templateId).toBe('sales');
    expect(brief.attendees).toHaveLength(1);
    expect(brief.firedAt).toBeGreaterThanOrEqual(before);
    expect(brief.firedAt).toBeLessThanOrEqual(after);
  });

  it('handles null projectId', () => {
    const event: CalendarEvent = {
      id: 'evt-456',
      title: 'Random chat',
      startTime: '2026-04-22T16:00:00Z',
      endTime: '2026-04-22T16:30:00Z',
      source: 'google',
    };

    const brief = composer.compose(event, null, 'default', []);
    expect(brief.projectId).toBeNull();
    expect(brief.attendees).toEqual([]);
  });
});
