import Database from 'better-sqlite3';

export interface MacroProposal {
  projectId: string;
  meetingType: string;
  templateId: string;
  dispatchTarget: string;
}

export interface MeetingRow {
  id: string;
  project_id: string;
  meeting_type: string;
  template_id: string;
  dispatch_target: string;
}

export interface MeetingStore {
  getMeeting(meetingId: string): MeetingRow | undefined;
  countSameType(projectId: string, meetingType: string, excludeId: string): number;
}

/**
 * Observe meeting repetition and propose a macro after the 2nd same-type
 * meeting in the same project — if no macro already exists for that pair.
 */
export class MacroLearner {
  constructor(
    private db: Database.Database,
    private meetingStore: MeetingStore,
  ) {}

  evaluate(meetingId: string): MacroProposal | null {
    const meeting = this.meetingStore.getMeeting(meetingId);
    if (!meeting) return null;

    const count = this.meetingStore.countSameType(
      meeting.project_id,
      meeting.meeting_type,
      meetingId,
    );

    // Only propose on the 2nd meeting (count of *other* same-type meetings == 1)
    if (count !== 1) return null;

    // Check if a macro already exists for this project + meeting_type
    const existing = this.db
      .prepare('SELECT id FROM dispatch_macros WHERE project_id = ? AND meeting_type = ?')
      .get(meeting.project_id, meeting.meeting_type);
    if (existing) return null;

    return {
      projectId: meeting.project_id,
      meetingType: meeting.meeting_type,
      templateId: meeting.template_id,
      dispatchTarget: meeting.dispatch_target,
    };
  }
}
