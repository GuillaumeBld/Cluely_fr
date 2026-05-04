import type { MeetingType } from '../config/meetingTypeTemplates';
import { MEETING_TYPE_KEYWORDS } from '../config/meetingTypeTemplates';

const DETECTION_ORDER: MeetingType[] = ['standup', 'one_on_one', 'sales', 'interview'];

export function detectMeetingType(title: string): MeetingType {
  if (!title) return 'general';
  const lower = title.toLowerCase();
  for (const type of DETECTION_ORDER) {
    const keywords = MEETING_TYPE_KEYWORDS[type];
    if (keywords.some(kw => lower.includes(kw))) {
      return type;
    }
  }
  return 'general';
}
