import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import { IpcEventBus } from './IpcEventBus';
import { MacroLearner, MeetingRow } from '../../src/services/MacroLearner';

export class PatternLearner {
  private macroLearner: MacroLearner;
  private _handler = (_payload: { meeting_id: string }) => {
    // meeting:ended carries only meeting_id; observe() must be called
    // explicitly by the dispatch path with full MeetingRow.
    // This handler is a no-op hook for future extension.
  };

  constructor(private db: Database.Database) {
    const store = {
      getMeeting: (id: string) =>
        db.prepare('SELECT * FROM completed_meetings WHERE id = ?').get(id) as MeetingRow | undefined,
      countSameType: (projectId: string, meetingType: string, excludeId: string) =>
        (db.prepare(
          'SELECT COUNT(*) as cnt FROM completed_meetings WHERE project_id = ? AND meeting_type = ? AND id != ?'
        ).get(projectId, meetingType, excludeId) as { cnt: number }).cnt,
    };
    this.macroLearner = new MacroLearner(db, store);
    IpcEventBus.onTyped('meeting:ended', this._handler);
  }

  observe(row: MeetingRow): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO completed_meetings (id, project_id, meeting_type, template_id, dispatch_target)
       VALUES (?, ?, ?, ?, ?)`
    ).run(row.id, row.project_id, row.meeting_type, row.template_id, row.dispatch_target);

    const proposal = this.macroLearner.evaluate(row.id);
    if (proposal) {
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('macro:proposal', { proposal });
        }
      });
    }
  }

  dispose(): void {
    IpcEventBus.offTyped('meeting:ended', this._handler);
  }
}
