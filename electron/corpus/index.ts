// electron/corpus/index.ts
export { loadCorpusConfig, getDefaultProjectConfig } from './corpus.config';
export type { CorpusProjectConfig, CorpusConfig } from './corpus.config';
export { CorpusIndexer, chunkText } from './CorpusIndexer';
export type { EmbeddingProvider } from './CorpusIndexer';
export { CorpusRetriever } from './CorpusRetriever';
export type { CorpusChunk } from './CorpusRetriever';
export { CorpusFreshnessGuard } from './CorpusFreshnessGuard';
export type { FreshnessResult } from './CorpusFreshnessGuard';
export { CorpusWatcher } from './CorpusWatcher';
export { TaskGeneratorContext } from './TaskGeneratorContext';
export type { TaskCitation, GeneratedTask, TaskGeneratorContextOptions } from './TaskGeneratorContext';
export { UploadGuard, CorpusLeakError } from './UploadGuard';
