import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCurrentMeetingType,
  setCurrentMeetingType,
  resetMeetingType,
  MEETING_TYPE_KEYWORDS,
} from '../../electron/config/meetingTypeTemplates';

describe('meetingTypeTemplates', () => {
  beforeEach(() => {
    resetMeetingType();
  });

  it('returns general by default', () => {
    expect(getCurrentMeetingType()).toBe('general');
  });

  it('updates type with setCurrentMeetingType', () => {
    setCurrentMeetingType('standup');
    expect(getCurrentMeetingType()).toBe('standup');
  });

  it('resets to general', () => {
    setCurrentMeetingType('sales');
    resetMeetingType();
    expect(getCurrentMeetingType()).toBe('general');
  });

  it('keywords map includes standup keywords', () => {
    expect(MEETING_TYPE_KEYWORDS.standup).toContain('standup');
  });
});
