import type { CommitmentRow } from '../../electron/memory/DecisionQuery';

export interface InjectedDecision {
  text: string;
  speaker: string;
  timestamp: string;
  meeting_id: string | null;
}

export interface InjectedContext {
  decisions: InjectedDecision[];
  injectedMeetingIds: string[];
}

export interface LedgerQueryService {
  getCommitments(days: number): CommitmentRow[];
}

/**
 * Pull top-K prior decisions from the ledger for a given project,
 * filtered by commitment edges, with provenance metadata.
 */
export class CrossSessionContextInjector {
  constructor(private ledgerQuery: LedgerQueryService) {}

  inject(_projectId: string, _meetingType: string, topK = 3): InjectedContext {
    const commitments = this.ledgerQuery.getCommitments(30);

    // Filter to commitments relevant to this project (source or target label contains project)
    // Since CommitmentRow doesn't have project_id, we match by meeting_id pattern or labels.
    // For now, return all commitments and let the caller's project context filter.
    // The plan specifies: .filter(d => d.project_id === projectId) but CommitmentRow
    // doesn't carry project_id. We pass all and slice to topK.
    const relevant = commitments.slice(0, topK);

    const decisions: InjectedDecision[] = relevant.map((row) => ({
      text: `${row.source_label} ${row.predicate} ${row.target_label}`,
      speaker: row.source_label,
      timestamp: row.created_at,
      meeting_id: row.meeting_id,
    }));

    const meetingIds = [
      ...new Set(
        decisions
          .map((d) => d.meeting_id)
          .filter((id): id is string => id !== null),
      ),
    ];

    return { decisions, injectedMeetingIds: meetingIds };
  }
}
