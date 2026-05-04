import { describe, it, expect } from 'vitest';
import { detectMeetingType } from '../../electron/services/MeetingTypeDetector';
import { MEETING_TYPE_KEYWORDS } from '../../electron/config/meetingTypeTemplates';
import type { MeetingType } from '../../electron/config/meetingTypeTemplates';

describe('detectMeetingType', () => {
  it('detects standup from title', () => {
    expect(detectMeetingType('Daily Standup')).toBe('standup');
  });

  it('detects standup from "scrum"', () => {
    expect(detectMeetingType('Team Scrum')).toBe('standup');
  });

  it('detects one_on_one from "1:1"', () => {
    expect(detectMeetingType('1:1 with Alice')).toBe('one_on_one');
  });

  it('detects sales from "demo"', () => {
    expect(detectMeetingType('Product Demo with Acme')).toBe('sales');
  });

  it('detects interview from title', () => {
    expect(detectMeetingType('Technical Interview - Backend')).toBe('interview');
  });

  it('returns general for unknown title', () => {
    expect(detectMeetingType('Q3 Planning')).toBe('general');
  });

  it('returns general for empty string', () => {
    expect(detectMeetingType('')).toBe('general');
  });

  it('is case-insensitive', () => {
    expect(detectMeetingType('DAILY STAND-UP')).toBe('standup');
  });
});

describe('detectMeetingType — keyword exhaustiveness', () => {
  const entries = Object.entries(MEETING_TYPE_KEYWORDS) as [MeetingType, string[]][];
  for (const [type, keywords] of entries) {
    if (keywords.length === 0) continue; // general has no keywords
    for (const kw of keywords) {
      it(`detects '${type}' from keyword '${kw}'`, () => {
        expect(detectMeetingType(kw)).toBe(type);
      });
    }
  }
});
