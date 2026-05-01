import { DatabaseManager } from '../db/DatabaseManager';

export interface OpenCommitment {
  text: string;
  meeting_id: string;
  goal_id: string;
  meeting_date: string;
}

export class GoalHintBuilder {
  constructor(private db: DatabaseManager) {}

  buildPreCallHint(goalId: string): OpenCommitment[] {
    return this.db.getOpenActionItemsByGoal(goalId);
  }
}
