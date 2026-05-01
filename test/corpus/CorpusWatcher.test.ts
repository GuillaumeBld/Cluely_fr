import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CorpusWatcher } from '../../electron/corpus/CorpusWatcher';
import { CorpusProjectConfig } from '../../electron/corpus/corpus.config';

describe('CorpusWatcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-watcher-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('triggers incrementalIndex when a watched file changes', async () => {
    const config: CorpusProjectConfig = {
      projectId: 'p1',
      rootPath: tmpDir,
      includeGlobs: ['**/*.ts'],
      excludeGlobs: ['node_modules/**'],
      commitCap: 100,
      freshnessThresholdHours: 2,
    };

    const mockIndexer = {
      incrementalIndex: vi.fn().mockResolvedValue(5),
      indexFile: vi.fn(),
      indexCommits: vi.fn(),
    };

    const watcher = new CorpusWatcher([config], mockIndexer as any);
    watcher.start();

    // Write a file to trigger the watcher
    fs.writeFileSync(path.join(tmpDir, 'new.ts'), 'const x = 1;');

    // Wait for debounce (500ms) + buffer
    await new Promise(r => setTimeout(r, 1200));

    watcher.stop();

    expect(mockIndexer.incrementalIndex).toHaveBeenCalledWith(config);
  });

  it('stops cleanly without errors', () => {
    const config: CorpusProjectConfig = {
      projectId: 'p1',
      rootPath: tmpDir,
      includeGlobs: ['**/*.ts'],
      excludeGlobs: [],
      commitCap: 100,
      freshnessThresholdHours: 2,
    };

    const mockIndexer = { incrementalIndex: vi.fn() };
    const watcher = new CorpusWatcher([config], mockIndexer as any);
    watcher.start();
    watcher.stop();
    // No error = success
  });
});
