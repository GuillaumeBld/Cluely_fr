import { ipcMain } from 'electron';
import { AttendeeTracker } from '../services/AttendeeTracker';

export function registerAttendeeHandlers(tracker: AttendeeTracker): void {
  ipcMain.handle('attendee:get-all', () => tracker.getAttendees());
}
