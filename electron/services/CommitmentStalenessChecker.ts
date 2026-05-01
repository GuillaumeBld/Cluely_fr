export interface OpenCommitment {
  id: string;
  meetingId: string;
  text: string;
  speaker: string;
  timestamp: number; // ms since epoch
  dispatchedJobId: string | null;
}

export interface CommitmentQuerySource {
  queryOpenCommitments(): OpenCommitment[];
}

export class CommitmentStalenessChecker {
  constructor(private source: CommitmentQuerySource) {}

  check(): OpenCommitment[] {
    const all = this.source.queryOpenCommitments();
    const now = Date.now();
    return all.filter(c => {
      return c.timestamp < now && !c.dispatchedJobId;
    });
  }
}
