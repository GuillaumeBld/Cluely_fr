import { describe, it, expect } from 'vitest';
import { CommitmentStalenessChecker, OpenCommitment, CommitmentQuerySource } from '../../electron/services/CommitmentStalenessChecker';

function makeCommitment(overrides: Partial<OpenCommitment> = {}): OpenCommitment {
  return {
    id: 'c1',
    meetingId: 'm1',
    text: "I'll send the report",
    speaker: 'Alice',
    timestamp: Date.now() - 86_400_000, // 1 day ago
    dispatchedJobId: null,
    ...overrides,
  };
}

describe('CommitmentStalenessChecker', () => {
  it('returns stale commitments (past timestamp, not dispatched)', () => {
    const source: CommitmentQuerySource = {
      queryOpenCommitments: () => [
        makeCommitment({ id: 'stale', timestamp: Date.now() - 86_400_000, dispatchedJobId: null }),
        makeCommitment({ id: 'recent', timestamp: Date.now() + 86_400_000, dispatchedJobId: null }),
      ],
    };

    const checker = new CommitmentStalenessChecker(source);
    const stale = checker.check();

    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe('stale');
  });

  it('excludes dispatched commitments', () => {
    const source: CommitmentQuerySource = {
      queryOpenCommitments: () => [
        makeCommitment({ id: 'dispatched', timestamp: Date.now() - 86_400_000, dispatchedJobId: 'job-1' }),
      ],
    };

    const checker = new CommitmentStalenessChecker(source);
    const stale = checker.check();

    expect(stale).toHaveLength(0);
  });

  it('returns empty array when no commitments exist', () => {
    const source: CommitmentQuerySource = {
      queryOpenCommitments: () => [],
    };

    const checker = new CommitmentStalenessChecker(source);
    expect(checker.check()).toHaveLength(0);
  });

  it('correctly handles past-timestamp commitments (regression: ISO string timestamps were not converted)', () => {
    // This test guards against the main.ts adapter being removed.
    // The checker requires numeric ms timestamps; an ISO string like "2020-01-01T00:00:00Z"
    // would coerce to NaN in the < comparison and filter out everything silently.
    const pastMs = Date.now() - 86_400_000;
    const source: CommitmentQuerySource = {
      queryOpenCommitments: () => [
        makeCommitment({ id: 'past', timestamp: pastMs, dispatchedJobId: null }),
      ],
    };
    const checker = new CommitmentStalenessChecker(source);
    const result = checker.check();
    expect(result).toHaveLength(1);
    expect(typeof result[0].timestamp).toBe('number');
  });
});
