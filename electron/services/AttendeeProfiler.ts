import { EmailManager, EmailMessage } from './EmailManager';

export interface AttendeeProfile {
  email: string;
  recentEmails: EmailMessage[];
  openItems: string[];      // populated by memory graph when available
  priorDecisions: string[]; // populated by memory graph when available
}

export class AttendeeProfiler {
  private emailManager: EmailManager;

  constructor(emailManager: EmailManager) {
    this.emailManager = emailManager;
  }

  async profile(attendeeEmails: string[]): Promise<AttendeeProfile[]> {
    if (!attendeeEmails.length) return [];
    let emailMap: Map<string, EmailMessage[]>;
    try {
      emailMap = await this.emailManager.getMessagesFromSenders(attendeeEmails);
    } catch (err) {
      console.warn('[AttendeeProfiler] Email fetch failed, proceeding without email context:', err);
      emailMap = new Map();
    }
    return attendeeEmails.map(email => ({
      email,
      recentEmails: emailMap.get(email) ?? [],
      openItems: [] as string[],      // TODO(#13): query memory graph (Composite A)
      priorDecisions: [] as string[], // TODO(#13): query memory graph (Composite A)
    }));
  }
}
