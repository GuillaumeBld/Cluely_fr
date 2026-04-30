import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../electron/memory/migration';
import { registerMacroHandlers } from '../../src/ipc/macroHandlers';
import type { SafeHandleRegistrar } from '../../src/ipc/approvalHandlers';

describe('macroHandlers', () => {
  let db: Database.Database;
  let handlers: Map<string, Function>;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigration(db);
    handlers = new Map();
    const registrar: SafeHandleRegistrar = {
      safeHandle: (channel, listener) => handlers.set(channel, listener),
    };
    registerMacroHandlers(registrar, db);
  });

  afterEach(() => {
    db.close();
  });

  it('macro:confirm inserts a dispatch macro', async () => {
    const handler = handlers.get('macro:confirm')!;
    await handler(null, {
      proposal: {
        projectId: 'finbiz',
        meetingType: 'weekly-sync',
        templateId: 'code-task',
        dispatchTarget: 'finbiz-archon',
      },
    });

    const row = db.prepare('SELECT * FROM dispatch_macros WHERE project_id = ?').get('finbiz') as any;
    expect(row).toBeDefined();
    expect(row.meeting_type).toBe('weekly-sync');
    expect(row.template_id).toBe('code-task');
    expect(row.dispatch_target).toBe('finbiz-archon');
  });

  it('macro:confirm ignores duplicate (INSERT OR IGNORE)', async () => {
    const handler = handlers.get('macro:confirm')!;
    const proposal = {
      projectId: 'finbiz',
      meetingType: 'weekly-sync',
      templateId: 'code-task',
      dispatchTarget: 'finbiz-archon',
    };

    await handler(null, { proposal });
    await handler(null, { proposal });

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM dispatch_macros').get() as any).cnt;
    expect(count).toBe(1);
  });

  it('macro:dismiss returns success (no-op)', async () => {
    const handler = handlers.get('macro:dismiss')!;
    const result = await handler(null);
    expect(result).toEqual({ success: true });
  });

  it('macro:override returns overridden flag', async () => {
    const handler = handlers.get('macro:override')!;
    const result = await handler(null, { meetingId: 'meeting-5' });
    expect(result).toEqual({ meetingId: 'meeting-5', overridden: true });
  });
});
