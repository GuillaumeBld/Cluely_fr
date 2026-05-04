import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import { IpcEventBus } from '../../electron/services/IpcEventBus';
import { runMigration } from '../../electron/memory/migration';
import { PatternLearner } from '../../electron/services/PatternLearner';

const mockSend = vi.fn();
vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValue([
  { isDestroyed: () => false, webContents: { send: mockSend } } as any,
]);

describe('PatternLearner', () => {
  let db: Database.Database;
  let learner: PatternLearner;

  beforeEach(() => {
    mockSend.mockClear();
    db = new Database(':memory:');
    runMigration(db);
    learner = new PatternLearner(db);
  });

  afterEach(() => {
    learner.dispose();
    db.close();
  });

  it('does not broadcast on 1st meeting', () => {
    learner.observe({ id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    expect(mockSend).not.toHaveBeenCalledWith('macro:proposal', expect.anything());
  });

  it('broadcasts macro:proposal on 2nd same-type meeting', () => {
    learner.observe({ id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    learner.observe({ id: 'm2', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    expect(mockSend).toHaveBeenCalledWith('macro:proposal', {
      proposal: expect.objectContaining({ projectId: 'finbiz', meetingType: 'weekly-sync' }),
    });
  });

  it('does not broadcast if macro already saved', () => {
    db.prepare('INSERT INTO dispatch_macros (project_id, meeting_type, template_id, dispatch_target) VALUES (?, ?, ?, ?)')
      .run('finbiz', 'weekly-sync', 'code-task', 'notion');
    learner.observe({ id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    learner.observe({ id: 'm2', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    expect(mockSend).not.toHaveBeenCalledWith('macro:proposal', expect.anything());
  });

  it('does not broadcast for different project', () => {
    learner.observe({ id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    learner.observe({ id: 'm2', project_id: 'acme', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    expect(mockSend).not.toHaveBeenCalledWith('macro:proposal', expect.anything());
  });

  it('records meetings idempotently (INSERT OR IGNORE)', () => {
    learner.observe({ id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    learner.observe({ id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    const cnt = (db.prepare('SELECT COUNT(*) as cnt FROM completed_meetings').get() as any).cnt;
    expect(cnt).toBe(1);
  });

  it('does not send to destroyed windows', () => {
    vi.spyOn(BrowserWindow, 'getAllWindows').mockReturnValueOnce([
      { isDestroyed: () => true, webContents: { send: mockSend } } as any,
    ]);
    learner.observe({ id: 'm1', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    learner.observe({ id: 'm2', project_id: 'finbiz', meeting_type: 'weekly-sync', template_id: 'code-task', dispatch_target: 'notion' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('dispose() unregisters the IpcEventBus listener', () => {
    const offSpy = vi.spyOn(IpcEventBus, 'offTyped');
    learner.dispose();
    expect(offSpy).toHaveBeenCalledWith('meeting:ended', expect.any(Function));
    offSpy.mockRestore();
  });
});
