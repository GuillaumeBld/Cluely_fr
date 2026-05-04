import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const TEST_USERDATA = '/tmp/test-userdata-pcs';
const PERSIST_FILE = path.join(TEST_USERDATA, 'active-project.json');

const { mockSend, mockIsDestroyed, mockGetAllWindows } = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockIsDestroyed = vi.fn().mockReturnValue(false);
  const mockGetAllWindows = vi.fn().mockReturnValue([
    { isDestroyed: mockIsDestroyed, webContents: { send: mockSend } },
  ]);
  return { mockSend, mockIsDestroyed, mockGetAllWindows };
});

vi.mock('electron', () => ({
  app: { getPath: () => TEST_USERDATA },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

import { ProjectContextSwitcher } from '../../electron/services/ProjectContextSwitcher';

describe('ProjectContextSwitcher', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_USERDATA, { recursive: true });
    if (fs.existsSync(PERSIST_FILE)) fs.unlinkSync(PERSIST_FILE);
    ProjectContextSwitcher.resetInstance();
    mockSend.mockClear();
    mockGetAllWindows.mockClear();
    mockIsDestroyed.mockReturnValue(false);
  });

  afterEach(() => {
    ProjectContextSwitcher.resetInstance();
    if (fs.existsSync(PERSIST_FILE)) fs.unlinkSync(PERSIST_FILE);
  });

  // --- In-memory state ---

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

  // --- Singleton contract ---

  it('getInstance() returns the same instance on repeated calls', () => {
    const a = ProjectContextSwitcher.getInstance();
    const b = ProjectContextSwitcher.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance() produces a fresh null-state instance (no persisted file)', () => {
    const s = ProjectContextSwitcher.getInstance();
    s.switch('uuid-abc', 'acme');
    // Remove persist file so the fresh instance has nothing to load
    if (fs.existsSync(PERSIST_FILE)) fs.unlinkSync(PERSIST_FILE);
    ProjectContextSwitcher.resetInstance();
    const fresh = ProjectContextSwitcher.getInstance();
    expect(fresh.getActiveProjectId()).toBeNull();
    expect(fresh.getActiveProjectLabel()).toBeNull();
  });

  // --- Persistence round-trip ---

  it('switch() writes active-project.json to disk', () => {
    const s = ProjectContextSwitcher.getInstance();
    s.switch('p1', 'acme');
    expect(fs.existsSync(PERSIST_FILE)).toBe(true);
    const data = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf-8'));
    expect(data.projectId).toBe('p1');
    expect(data.label).toBe('acme');
  });

  it('clearActive() removes active-project.json from disk', () => {
    const s = ProjectContextSwitcher.getInstance();
    s.switch('p1', 'acme');
    expect(fs.existsSync(PERSIST_FILE)).toBe(true);
    s.clearActive();
    expect(fs.existsSync(PERSIST_FILE)).toBe(false);
  });

  it('load() restores persisted state on fresh getInstance()', () => {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify({ projectId: 'p1', label: 'Acme' }));
    const s = ProjectContextSwitcher.getInstance();
    expect(s.getActiveProjectId()).toBe('p1');
    expect(s.getActiveProjectLabel()).toBe('Acme');
  });

  it('load() leaves state null when active-project.json does not exist', () => {
    expect(fs.existsSync(PERSIST_FILE)).toBe(false);
    const s = ProjectContextSwitcher.getInstance();
    expect(s.getActiveProjectId()).toBeNull();
    expect(s.getActiveProjectLabel()).toBeNull();
  });

  it('load() recovers gracefully from corrupt JSON', () => {
    fs.writeFileSync(PERSIST_FILE, '{ not valid json ');
    const s = ProjectContextSwitcher.getInstance();
    expect(s.getActiveProjectId()).toBeNull();
    expect(s.getActiveProjectLabel()).toBeNull();
  });

  // --- Broadcast ---

  it('switch() broadcasts project:context-changed to open windows', () => {
    const s = ProjectContextSwitcher.getInstance();
    s.switch('p1', 'acme');
    expect(mockSend).toHaveBeenCalledWith('project:context-changed', { projectId: 'p1', label: 'acme' });
  });

  it('clearActive() broadcasts project:context-changed with null payload', () => {
    const s = ProjectContextSwitcher.getInstance();
    s.switch('p1', 'acme');
    mockSend.mockClear();
    s.clearActive();
    expect(mockSend).toHaveBeenCalledWith('project:context-changed', { projectId: null, label: null });
  });

  it('broadcastChange() skips destroyed windows', () => {
    mockIsDestroyed.mockReturnValue(true);
    const s = ProjectContextSwitcher.getInstance();
    s.switch('p1', 'acme');
    expect(mockSend).not.toHaveBeenCalled();
  });
});
