import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userdata' },
  BrowserWindow: { getAllWindows: () => [] },
}));

import { ProjectContextSwitcher } from '../../electron/services/ProjectContextSwitcher';

describe('ProjectContextSwitcher', () => {
  beforeEach(() => ProjectContextSwitcher.resetInstance());
  afterEach(() => ProjectContextSwitcher.resetInstance());

  it('returns null active project by default', () => {
    const s = ProjectContextSwitcher.getInstance();
    expect(s.getActiveProjectId()).toBeNull();
    expect(s.getActiveProjectLabel()).toBeNull();
  });

  it('switch() stores the active project', () => {
    const s = ProjectContextSwitcher.getInstance();
    s.switch('uuid-123', 'finbiz');
    expect(s.getActiveProjectId()).toBe('uuid-123');
    expect(s.getActiveProjectLabel()).toBe('finbiz');
  });

  it('clearActive() resets to null', () => {
    const s = ProjectContextSwitcher.getInstance();
    s.switch('uuid-123', 'finbiz');
    s.clearActive();
    expect(s.getActiveProjectId()).toBeNull();
    expect(s.getActiveProjectLabel()).toBeNull();
  });
});
