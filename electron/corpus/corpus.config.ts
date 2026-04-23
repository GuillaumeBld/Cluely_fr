// electron/corpus/corpus.config.ts
// Configuration schema and loader for local corpus RAG

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface CorpusProjectConfig {
  projectId: string;
  rootPath: string;
  includeGlobs: string[];
  excludeGlobs: string[];
  commitCap: number;
  freshnessThresholdHours: number;
  remote?: { sshHost: string; remotePath: string };
}

export interface CorpusConfig {
  projects: CorpusProjectConfig[];
}

const DEFAULT_INCLUDE_GLOBS = ['**/*.ts', '**/*.md', '**/*.py', '**/*.js', '**/*.tsx', '**/*.jsx'];
const DEFAULT_EXCLUDE_GLOBS = ['node_modules/**', 'dist/**', 'dist-electron/**', '.git/**', 'build/**'];
const DEFAULT_COMMIT_CAP = 100;
const DEFAULT_FRESHNESS_THRESHOLD_HOURS = 2;

function getConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'corpus.json');
}

export function loadCorpusConfig(): CorpusConfig {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return normalizeConfig(parsed);
    }
  } catch (error) {
    console.warn('[CorpusConfig] Failed to read corpus.json, using defaults:', error);
  }

  return { projects: [] };
}

function normalizeConfig(raw: any): CorpusConfig {
  if (!raw || !Array.isArray(raw.projects)) {
    return { projects: [] };
  }

  return {
    projects: raw.projects.map((p: any) => ({
      projectId: String(p.projectId || ''),
      rootPath: String(p.rootPath || ''),
      includeGlobs: Array.isArray(p.includeGlobs) ? p.includeGlobs : DEFAULT_INCLUDE_GLOBS,
      excludeGlobs: Array.isArray(p.excludeGlobs) ? p.excludeGlobs : DEFAULT_EXCLUDE_GLOBS,
      commitCap: typeof p.commitCap === 'number' ? p.commitCap : DEFAULT_COMMIT_CAP,
      freshnessThresholdHours: typeof p.freshnessThresholdHours === 'number'
        ? p.freshnessThresholdHours
        : DEFAULT_FRESHNESS_THRESHOLD_HOURS,
      ...(p.remote ? { remote: { sshHost: String(p.remote.sshHost), remotePath: String(p.remote.remotePath) } } : {}),
    })),
  };
}

export function getDefaultProjectConfig(projectId: string, rootPath: string): CorpusProjectConfig {
  return {
    projectId,
    rootPath,
    includeGlobs: DEFAULT_INCLUDE_GLOBS,
    excludeGlobs: DEFAULT_EXCLUDE_GLOBS,
    commitCap: DEFAULT_COMMIT_CAP,
    freshnessThresholdHours: DEFAULT_FRESHNESS_THRESHOLD_HOURS,
  };
}
