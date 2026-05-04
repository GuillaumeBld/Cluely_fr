import { describe, it, expect } from 'vitest';
import { detectMeetingType } from '../../electron/services/MeetingTypeDetector';

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
