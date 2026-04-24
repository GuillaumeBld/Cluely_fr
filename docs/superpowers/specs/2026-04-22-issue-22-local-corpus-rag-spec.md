# Local-Corpus RAG (git + docs + code)

## Problem & goal

When a meeting references a project, the task generator currently has no ground truth about the codebase. It must rely on transcript alone, producing tasks with hallucinated file paths, stale API references, and no traceable citations. This feature builds a local-only retrieval layer that indexes the git history, source files, and documentation of each project workspace, enabling every generated task to cite a real corpus chunk (file + line range, commit hash, or PR description) rather than inferred project details.

**Goal:** Every non-trivial generated task includes at least one traceable KB citation from the local corpus; cloud tools cannot access this data, making it a genuine competitive moat.

## User story

As Guillaume, when a meeting produces tasks that reference a codebase decision, I want each task to carry a citation to the specific file, commit, or PR where that decision lives — so I can verify the task is grounded in fact and not hallucinated by the LLM.

## Architecture

A background corpus indexer watches configured project roots and runs incremental re-index on file changes and new commits. Embeddings are stored in the Unified Memory SQLite database (Composite A) alongside the main memory graph nodes. At task-generation time, a retrieval function queries the index with the meeting's topic keywords and returns the top-K chunks, which are injected as grounding context before the recap LLM call.

The corpus index is strictly local and explicitly excluded from any NotebookLM sync path; enforcement is a deny-list check in the upload utility, not just documentation.

## Components

| File | Responsibility |
|------|---------------|
| `src/services/CorpusIndexer.ts` | Crawls configured project roots; extracts chunks from source files and git log; upserts embeddings into SQLite |
| `src/services/CorpusRetriever.ts` | Accepts query string; returns top-K chunks with source citation (file path + line range or commit hash) |
| `src/services/CorpusFreshnessGuard.ts` | Checks HEAD hash vs last-indexed hash per project; emits `corpus:stale` event and blocks task dispatch if gap > N hours |
| `src/main/corpus-watcher.ts` | FSWatch + git-poll daemon; triggers incremental re-index on changes |
| `src/config/corpus.config.ts` | Per-project config: root path, include/exclude globs, commit cap, freshness threshold |
| `src/llm/TaskGeneratorContext.ts` | Modified to call `CorpusRetriever` before recap LLM call and inject chunks into system prompt |

## Data flow

1. `corpus-watcher` detects file change or new commit → calls `CorpusIndexer.incrementalIndex(projectId)`.
2. `CorpusIndexer` chunks changed files (max 200 tokens/chunk) and commits in the last `commitCap` (default 100); embeds each chunk; upserts into `corpus_chunks(id, project_id, source_path, chunk_text, embedding, commit_hash, indexed_at)`.
3. At post-meeting task generation: `TaskGeneratorContext` calls `CorpusRetriever.query(topicKeywords, projectId, K=5)`.
4. Retriever runs cosine similarity against `corpus_chunks.embedding`, returns top-K with citation fields.
5. Citations injected into LLM system prompt; also stored on the generated task record as `citations[]`.
6. `CorpusFreshnessGuard` runs at dispatch time: if `now - indexed_at > threshold` → emits `corpus:stale`, dispatch blocked, banner shown.

## Error handling

- SSH-tunneled remote corpus (e.g. Finbiz VPS): wrap indexer in connection health check; on failure emit `corpus:remote_unavailable` and skip remote root, continue with local roots.
- Embedding API unavailable: queue chunks for retry with exponential backoff; do not block meeting processing.
- NotebookLM upload gate: `UploadUtility.upload()` checks source against `CORPUS_DENY_LIST`; throws `CorpusLeakError` if match found. Never silently upload.
- Commit cap exceeded: log warning, index only most recent `commitCap` commits.

## Testing approach

- Unit: `CorpusIndexer` — fixture repo with known files → assert correct chunks in DB.
- Unit: `CorpusRetriever` — seed DB with known embeddings → assert top-K returns correct source citations.
- Unit: `CorpusFreshnessGuard` — mock `indexed_at` timestamps → assert stale detection fires at correct threshold.
- Integration: end-to-end from file change → watcher trigger → index → retrieval → task citation present.
- Security: attempt NotebookLM upload with corpus path → assert `CorpusLeakError` thrown.

## Success criteria

1. Every task generated from a meeting that references a codebase includes ≥1 `citations[]` entry with a real file path or commit hash (measurable in task output schema).
2. `CorpusFreshnessGuard` blocks dispatch when index is >2 hours behind HEAD (automated test + manual smoke test).
3. No corpus chunk appears in any NotebookLM upload payload (enforced by deny-list test).
4. Incremental re-index completes in <30 seconds for a project with ≤1000 files and ≤100 tracked commits.
5. Remote corpus failure degrades gracefully: local retrieval continues, remote skipped, banner emitted.
