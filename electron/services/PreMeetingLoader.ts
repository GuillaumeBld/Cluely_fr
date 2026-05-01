import { Decision } from '../memory/schema';
import { LedgerQueryService } from './LedgerQueryService';

export interface PreBrief {
  meetingId: string;
  openCommitments: Decision[];
}

/**
 * Assembles a pre-meeting brief including open commitments from the decision ledger.
 */
export class PreMeetingLoader {
  private static instance: PreMeetingLoader | undefined;
  private queryService: LedgerQueryService;

  private constructor(queryService: LedgerQueryService) {
    this.queryService = queryService;
  }

  public static getInstance(queryService: LedgerQueryService): PreMeetingLoader {
    if (!PreMeetingLoader.instance) {
      PreMeetingLoader.instance = new PreMeetingLoader(queryService);
    }
    return PreMeetingLoader.instance;
  }

  public static resetInstance(): void {
    PreMeetingLoader.instance = undefined;
  }

  /**
   * Build a pre-meeting brief with open commitments.
   * Looks back 30 days by default.
   */
  public buildPreBrief(meetingId: string, goalId?: string): PreBrief {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);

    const openCommitments = this.queryService.queryOpenCommitments(goalId, thirtyDaysAgo);

    return {
      meetingId,
      openCommitments,
    };
  }
}
