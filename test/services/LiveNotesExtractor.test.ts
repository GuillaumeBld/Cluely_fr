import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LunrIndexer } from '../../electron/services/LunrIndexer';
import { LiveNotesExtractor } from '../../electron/services/LiveNotesExtractor';
import { IpcEventBus, LiveNoteSnapshot } from '../../electron/services/IpcEventBus';

describe('LiveNotesExtractor', () => {
  let indexer: LunrIndexer;
  let extractor: LiveNotesExtractor;
  let snapshots: LiveNoteSnapshot[];
  let handler: (e: LiveNoteSnapshot) => void;

  beforeEach(() => {
    indexer = new LunrIndexer();
    extractor = new LiveNotesExtractor(indexer, 600, 999_999);
    snapshots = [];
    handler = (e) => snapshots.push(e);
    IpcEventBus.onTyped('notes:updated', handler);
  });

  afterEach(() => {
    extractor.stop();
    IpcEventBus.offTyped('notes:updated', handler);
  });

  it('emits notes:updated with action item on commitment patterns', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: "I'll finish the report", timestamp: now, meeting_id: 'm1' });
    extractor.start('m1');
    extractor.tick();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].action_items).toHaveLength(1);
    expect(snapshots[0].action_items[0].speaker).toBe('Alice');
  });

  it('emits notes:updated with decision on decision patterns', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Bob', text: 'We decided to go with React', timestamp: now, meeting_id: 'm1' });
    extractor.start('m1');
    extractor.tick();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].decisions).toHaveLength(1);
  });

  it('emits nothing for neutral turns', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: 'Good morning everyone', timestamp: now, meeting_id: 'm1' });
    extractor.start('m1');
    extractor.tick();
    expect(snapshots).toHaveLength(0);
  });

  it('deduplicates: second tick on same turns does not re-emit', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: "I'll handle the migration", timestamp: now, meeting_id: 'm1' });
    extractor.start('m1');
    extractor.tick();
    extractor.tick();
    expect(snapshots).toHaveLength(1);
  });

  it('snapshot includes turn_count', () => {
    const now = Date.now();
    indexer.addTurn({ turn_id: 't1', speaker: 'Alice', text: "I'll do it", timestamp: now, meeting_id: 'm1' });
    indexer.addTurn({ turn_id: 't2', speaker: 'Bob', text: 'Sounds good', timestamp: now, meeting_id: 'm1' });
    extractor.start('m1');
    extractor.tick();
    expect(snapshots[0].turn_count).toBe(2);
  });
});
