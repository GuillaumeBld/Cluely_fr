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
    const emailMap = await this.emailManager.getMessagesFromSenders(attendeeEmails);
    return attendeeEmails.map(email => ({
      email,
      recentEmails: emailMap.get(email) ?? [],
      openItems: [],      // TODO: query memory graph (Composite A)
      priorDecisions: [], // TODO: query memory graph (Composite A)
    }));
  }
}
