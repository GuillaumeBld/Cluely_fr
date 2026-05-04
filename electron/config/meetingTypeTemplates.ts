export type MeetingType = 'standup' | 'one_on_one' | 'sales' | 'interview' | 'general';

export const MEETING_TYPE_KEYWORDS: Record<MeetingType, string[]> = {
  standup: ['standup', 'stand-up', 'stand up', 'daily', 'scrum', 'sync', 'morning sync'],
  one_on_one: ['1:1', '1-1', 'one on one', 'one-on-one', '1on1', 'catch up', 'catch-up'],
  sales: ['sales', 'demo', 'pitch', 'prospect', 'discovery', 'closing', 'follow-up call', 'client call'],
  interview: ['interview', 'candidate', 'hiring', 'screening', 'onsite', 'technical screen'],
  general: [],
};

const DEFAULT_MEETING_TYPE: MeetingType = 'general';

let currentMeetingType: MeetingType = DEFAULT_MEETING_TYPE;

export function getCurrentMeetingType(): MeetingType {
  return currentMeetingType;
}

export function setCurrentMeetingType(type: MeetingType): void {
  currentMeetingType = type;
}

export function resetMeetingType(): void {
  currentMeetingType = DEFAULT_MEETING_TYPE;
}
