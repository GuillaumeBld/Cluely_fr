import { CalendarEvent } from './CalendarManager';
import { AttendeeProfile } from './AttendeeProfiler';
import { TemplateId } from './TemplateClassifier';

export interface PreBrief {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  projectId: string | null;
  templateId: TemplateId;
  attendees: AttendeeProfile[];
  firedAt: number;
}

export class PreBriefComposer {
  compose(
    event: CalendarEvent,
    projectId: string | null,
    templateId: TemplateId,
    attendees: AttendeeProfile[],
  ): PreBrief {
    return {
      eventId: event.id,
      eventTitle: event.title,
      startsAt: event.startTime,
      projectId,
      templateId,
      attendees,
      firedAt: Date.now(),
    };
  }
}

export const preBriefComposer = new PreBriefComposer();
