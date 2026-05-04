import { describe, it, expect, vi, beforeEach } from 'vitest';

// Collect registered ipcMain handlers
const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      handlers.set(channel, fn);
    },
  },
  app: { getPath: () => '/tmp/test' },
  BrowserWindow: class { static getAllWindows() { return []; } },
}));

import { registerAttendeeHandlers } from '../../electron/ipc/attendeeHandlers';

describe('registerAttendeeHandlers', () => {
  let mockTracker: any;

  beforeEach(() => {
    handlers.clear();
    mockTracker = { getAttendees: vi.fn().mockReturnValue([{ speaker: 'Alice' }]) };
    registerAttendeeHandlers(mockTracker);
  });

  it('registers the attendee:get-all channel', () => {
    expect(handlers.has('attendee:get-all')).toBe(true);
  });

  it('attendee:get-all delegates to tracker.getAttendees()', () => {
    const result = handlers.get('attendee:get-all')!({});
    expect(mockTracker.getAttendees).toHaveBeenCalledOnce();
    expect(result).toEqual([{ speaker: 'Alice' }]);
  });
});
