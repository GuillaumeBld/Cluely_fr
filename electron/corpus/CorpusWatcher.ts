// electron/corpus/CorpusWatcher.ts
// Background daemon that watches project files and polls git HEAD

import fs from 'fs';
import { execSync } from 'child_process';
import { CorpusProjectConfig } from './corpus.config';
import { CorpusIndexer } from './CorpusIndexer';

const DEBOUNCE_MS = 500;
const GIT_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class CorpusWatcher {
  private configs: CorpusProjectConfig[];
  private indexer: CorpusIndexer;
  private watchers: fs.FSWatcher[] = [];
  private gitPollTimers: ReturnType<typeof setInterval>[] = [];
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastHeadHashes: Map<string, string> = new Map();

  constructor(configs: CorpusProjectConfig[], indexer: CorpusIndexer) {
    this.configs = configs;
    this.indexer = indexer;
  }

  start(): void {
    for (const config of this.configs) {
      this.watchProject(config);
    }
    console.log(`[CorpusWatcher] Started watching ${this.configs.length} project(s)`);
  }

  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    for (const timer of this.gitPollTimers) {
      clearInterval(timer);
    }
    this.gitPollTimers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    console.log('[CorpusWatcher] Stopped');
  }

  private watchProject(config: CorpusProjectConfig): void {
    const { projectId, rootPath } = config;

    // File system watcher
    try {
      const watcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        this.debouncedIndex(config);
      });
      this.watchers.push(watcher);
    } catch (err) {
      console.warn(`[CorpusWatcher] Failed to watch ${rootPath}:`, err);
    }

    // Git HEAD poll
    const initialHash = this.getGitHead(rootPath);
    if (initialHash) {
      this.lastHeadHashes.set(projectId, initialHash);
    }

    const timer = setInterval(() => {
      this.pollGitHead(config);
    }, GIT_POLL_INTERVAL_MS);
    this.gitPollTimers.push(timer);

    // Check remote if configured
    if (config.remote) {
      this.pollRemoteHead(config);
    }
  }

  private debouncedIndex(config: CorpusProjectConfig): void {
    const existing = this.debounceTimers.get(config.projectId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(config.projectId);
      this.indexer.incrementalIndex(config).catch(err => {
        console.error(`[CorpusWatcher] Incremental index failed for ${config.projectId}:`, err);
      });
    }, DEBOUNCE_MS);

    this.debounceTimers.set(config.projectId, timer);
  }

  private getGitHead(repoPath: string): string | null {
    try {
      return execSync(`git -C "${repoPath}" rev-parse HEAD`, { encoding: 'utf-8' }).trim();
    } catch {
      return null;
    }
  }

  private pollGitHead(config: CorpusProjectConfig): void {
    const { projectId, rootPath } = config;
    const currentHead = this.getGitHead(rootPath);
    if (!currentHead) return;

    const lastHead = this.lastHeadHashes.get(projectId);
    if (lastHead && lastHead !== currentHead) {
      console.log(`[CorpusWatcher] HEAD changed for ${projectId}: ${lastHead.slice(0, 8)} → ${currentHead.slice(0, 8)}`);
      this.lastHeadHashes.set(projectId, currentHead);
      this.indexer.incrementalIndex(config).catch(err => {
        console.error(`[CorpusWatcher] Git poll index failed for ${projectId}:`, err);
      });
    } else if (!lastHead) {
      this.lastHeadHashes.set(projectId, currentHead);
    }
  }

  private pollRemoteHead(config: CorpusProjectConfig): void {
    if (!config.remote) return;

    const { sshHost, remotePath } = config.remote;
    try {
      const remoteHead = execSync(
        `ssh "${sshHost}" "git -C '${remotePath}' rev-parse HEAD"`,
        { encoding: 'utf-8', timeout: 10_000 }
      ).trim();
      console.log(`[CorpusWatcher] Remote HEAD for ${config.projectId}: ${remoteHead.slice(0, 8)}`);
    } catch (err) {
      console.warn(`[CorpusWatcher] Remote check failed for ${config.projectId} (degrading gracefully):`, err);
    }
  }
}
