import { describe, it, expect } from 'vitest';
import {
  MEETING_TYPE_KEYWORDS,
  DEFAULT_MEETING_TYPE,
} from '../../electron/config/meetingTypeTemplates';

describe('meetingTypeTemplates', () => {
  it('DEFAULT_MEETING_TYPE is general', () => {
    expect(DEFAULT_MEETING_TYPE).toBe('general');
  });

  it('keywords map includes standup keywords', () => {
    expect(MEETING_TYPE_KEYWORDS.standup).toContain('standup');
  });

  it('general type has empty keywords array', () => {
    expect(MEETING_TYPE_KEYWORDS.general).toHaveLength(0);
  });

  it('all non-general types have at least one keyword', () => {
    const nonGeneral = ['standup', 'one_on_one', 'sales', 'interview'] as const;
    for (const type of nonGeneral) {
      expect(MEETING_TYPE_KEYWORDS[type].length).toBeGreaterThan(0);
    }
  });
});
