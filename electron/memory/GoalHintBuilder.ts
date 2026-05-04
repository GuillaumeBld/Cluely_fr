import { DatabaseManager } from '../db/DatabaseManager';

export interface OpenCommitment {
  text: string;
  meeting_id: string;
  goal_id: string;
  meeting_date: string;
}

/**
 * Builds the pre-call hint strip shown before a meeting starts.
 * Surfaces open (uncompleted) action items from past meetings that are tagged
 * with the currently selected goal, reminding the user of outstanding commitments.
 */
export class GoalHintBuilder {
  constructor(private db: DatabaseManager) {}

  /**
   * Return open action items for the given goal, ordered by most recent meeting first.
   * Used by the `goal:pre-call-hint` IPC handler and rendered in `PreCallHint.tsx`.
   */
  buildPreCallHint(goalId: string): OpenCommitment[] {
    return this.db.getOpenActionItemsByGoal(goalId);
  }
}
