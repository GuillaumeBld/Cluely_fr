> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Build a local-only corpus RAG layer (git history + source files + docs) that indexes project workspaces, retrieves top-K chunks at task-generation time, and injects traceable KB citations into every generated Archon task. Includes a freshness guard that blocks dispatch when the index is stale.

**Architecture:** A background FSWatch + git-poll daemon triggers incremental indexing into the Unified Memory SQLite DB (`corpus_chunks` table with embeddings). `CorpusRetriever` does cosine similarity lookup at task-generation time and injects chunks into the LLM system prompt. `CorpusFreshnessGuard` checks index age at dispatch time. All corpus paths are excluded from NotebookLM upload via an enforced deny-list.

**Tech Stack:** TypeScript, Electron main process, SQLite (existing unified memory DB from Composite A), `sqlite-vss` or `better-sqlite3` vector search, Node.js `fs.watch` / `simple-git`, existing embedding utility.

---

### Task 1: DB schema — `corpus_chunks` table

**Files:**
- Modify: `src/db/migrations/003_corpus_chunks.sql` (create)
- Modify: `src/db/schema.ts` (add table type)
- Modify: `src/db/index.ts` (run migration on startup)

- [ ] Step 1: Write test asserting `corpus_chunks` table exists with columns `(id, project_id, source_path, chunk_text, embedding BLOB, commit_hash, indexed_at)` after migration runs.
  ```ts
  // tests/db/corpus_chunks.test.ts
  it('creates corpus_chunks table', () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='corpus_chunks'").get();
    expect(row).toBeDefined();
  });
  ```
- [ ] Step 2: Run `npx vitest run tests/db/corpus_chunks.test.ts` → expect FAIL (table missing).
- [ ] Step 3: Create `src/db/migrations/003_corpus_chunks.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS corpus_chunks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding BLOB,
    commit_hash TEXT,
    indexed_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_corpus_chunks_project ON corpus_chunks(project_id);
  ```
  Wire migration in `src/db/index.ts` (run after existing migrations).
- [ ] Step 4: Run `npx vitest run tests/db/corpus_chunks.test.ts` → expect PASS.
- [ ] Step 5: `git add src/db/migrations/003_corpus_chunks.sql src/db/schema.ts src/db/index.ts tests/db/corpus_chunks.test.ts && git commit -m "feat(corpus): add corpus_chunks migration"`

---

### Task 2: Corpus config schema

**Files:**
- Create: `src/config/corpus.config.ts`

- [ ] Step 1: Write test asserting `loadCorpusConfig()` returns typed config with `roots`, `commitCap`, `freshnessThresholdHours`, `includeGlobs`, `excludeGlobs` fields.
  ```ts
  // tests/config/corpus.config.test.ts
  it('returns defaults when no config file', () => {
    const cfg = loadCorpusConfig();
    expect(cfg.commitCap).toBe(100);
    expect(cfg.freshnessThresholdHours).toBe(2);
  });
  ```
- [ ] Step 2: Run test → expect FAIL.
- [ ] Step 3: Implement `src/config/corpus.config.ts`:
  ```ts
  export interface CorpusProjectConfig {
    projectId: string;
    rootPath: string;
    includeGlobs: string[];   // default: ['**/*.ts','**/*.md','**/*.py']
    excludeGlobs: string[];   // default: ['node_modules/**','dist/**']
    commitCap: number;        // default: 100
    freshnessThresholdHours: number; // default: 2
    remote?: { sshHost: string; remotePath: string };
  }
  export function loadCorpusConfig(): CorpusProjectConfig[] { /* reads from ~/.cluely/corpus.json, falls back to defaults */ }
  ```
- [ ] Step 4: Run test → expect PASS.
- [ ] Step 5: `git add src/config/corpus.config.ts tests/config/corpus.config.test.ts && git commit -m "feat(corpus): add corpus config schema"`

---

### Task 3: CorpusIndexer — chunk + embed + upsert

**Files:**
- Create: `src/services/CorpusIndexer.ts`
- Test: `tests/services/CorpusIndexer.test.ts`

- [ ] Step 1: Write tests:
  ```ts
  it('chunks a file into ≤200-token segments and upserts to DB', async () => {
    const indexer = new CorpusIndexer(db, mockEmbedder);
    await indexer.indexFile('proj-1', '/tmp/fixture/foo.ts', null);
    const rows = db.prepare('SELECT * FROM corpus_chunks WHERE project_id=?').all('proj-1');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].source_path).toBe('/tmp/fixture/foo.ts');
  });
  it('does not exceed commitCap when indexing git log', async () => { /* seed repo with 150 commits, assert ≤100 indexed */ });
  ```
- [ ] Step 2: Run → expect FAIL.
- [ ] Step 3: Implement `CorpusIndexer`:
  - `chunkText(text, maxTokens=200)` splits on paragraph/function boundaries, falls back to token count.
  - `indexFile(projectId, filePath, commitHash)` chunks → embeds via existing `EmbeddingService` → upserts by `id = hash(projectId+filePath+chunkIndex)`.
  - `indexCommits(projectId, repoPath, cap)` uses `simple-git` to read last `cap` commit messages + diffs, indexes each as a chunk with `commit_hash` set.
  - `incrementalIndex(projectId)` computes which files changed since `max(indexed_at)`, calls `indexFile` for each.
- [ ] Step 4: Run tests → expect PASS.
- [ ] Step 5: `git add src/services/CorpusIndexer.ts tests/services/CorpusIndexer.test.ts && git commit -m "feat(corpus): implement CorpusIndexer with chunking and embedding"`

---

### Task 4: CorpusRetriever — cosine similarity lookup

**Files:**
- Create: `src/services/CorpusRetriever.ts`
- Test: `tests/services/CorpusRetriever.test.ts`

- [ ] Step 1: Write test:
  ```ts
  it('returns top-K chunks sorted by cosine similarity with source citations', async () => {
    // seed DB with 10 chunks with known embeddings
    const retriever = new CorpusRetriever(db, mockEmbedder);
    const results = await retriever.query('authentication middleware', 'proj-1', 3);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ source_path: expect.any(String), chunk_text: expect.any(String), score: expect.any(Number) });
  });
  ```
- [ ] Step 2: Run → expect FAIL.
- [ ] Step 3: Implement `CorpusRetriever`:
  ```ts
  async query(queryText: string, projectId: string, k = 5): Promise<CorpusChunk[]> {
    const qEmbed = await this.embedder.embed(queryText);
    const rows = this.db.prepare('SELECT * FROM corpus_chunks WHERE project_id=?').all(projectId);
    return rows
      .map(r => ({ ...r, score: cosineSimilarity(qEmbed, deserializeEmbedding(r.embedding)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
  ```
  Export `CorpusChunk` type: `{ id, project_id, source_path, chunk_text, commit_hash, score }`.
- [ ] Step 4: Run → expect PASS.
- [ ] Step 5: `git add src/services/CorpusRetriever.ts tests/services/CorpusRetriever.test.ts && git commit -m "feat(corpus): implement CorpusRetriever with cosine similarity"`

---

### Task 5: CorpusFreshnessGuard

**Files:**
- Create: `src/services/CorpusFreshnessGuard.ts`
- Test: `tests/services/CorpusFreshnessGuard.test.ts`

- [ ] Step 1: Write tests:
  ```ts
  it('returns stale=true when max(indexed_at) is older than threshold', () => {
    const guard = new CorpusFreshnessGuard(db, { freshnessThresholdHours: 2 });
    // seed corpus_chunks with indexed_at = 3 hours ago
    expect(guard.check('proj-1')).toMatchObject({ stale: true });
  });
  it('returns stale=false when index is recent', () => { /* indexed_at = 1 hour ago */ });
  ```
- [ ] Step 2: Run → expect FAIL.
- [ ] Step 3: Implement:
  ```ts
  check(projectId: string): { stale: boolean; lastIndexedAt: number | null; headHash: string | null } {
    const row = db.prepare('SELECT MAX(indexed_at) as last FROM corpus_chunks WHERE project_id=?').get(projectId);
    const ageHours = (Date.now() - (row?.last ?? 0)) / 3_600_000;
    return { stale: ageHours > this.config.freshnessThresholdHours, lastIndexedAt: row?.last ?? null, headHash: null };
  }
  ```
  Emit `corpus:stale` IPC event (via existing event bus) when stale detected at dispatch time.
- [ ] Step 4: Run → expect PASS.
- [ ] Step 5: `git add src/services/CorpusFreshnessGuard.ts tests/services/CorpusFreshnessGuard.test.ts && git commit -m "feat(corpus): implement CorpusFreshnessGuard"`

---

### Task 6: Corpus watcher daemon (main process)

**Files:**
- Create: `src/main/corpus-watcher.ts`
- Modify: `src/main/index.ts` (start watcher on app ready)

- [ ] Step 1: Write integration test:
  ```ts
  it('triggers incrementalIndex when a watched file changes', async () => {
    const indexer = { incrementalIndex: vi.fn() };
    const watcher = new CorpusWatcher([{ projectId: 'p1', rootPath: tmpDir }], indexer);
    await watcher.start();
    fs.writeFileSync(path.join(tmpDir, 'new.ts'), 'const x = 1;');
    await new Promise(r => setTimeout(r, 500));
    expect(indexer.incrementalIndex).toHaveBeenCalledWith('p1');
  });
  ```
- [ ] Step 2: Run → expect FAIL.
- [ ] Step 3: Implement `CorpusWatcher`:
  - `start()` → calls `fs.watch(rootPath, { recursive: true }, debounce(500ms, () => indexer.incrementalIndex(projectId)))`.
  - Also polls git HEAD hash every 5 minutes; if HEAD changed → trigger `incrementalIndex`.
  - Remote corpus: if config has `remote`, runs `ssh host "git -C remotePath rev-parse HEAD"` to detect changes; on connection error logs warning and skips.
- [ ] Step 4: Run → expect PASS.
- [ ] Step 5: `git add src/main/corpus-watcher.ts src/main/index.ts tests/main/corpus-watcher.test.ts && git commit -m "feat(corpus): add corpus watcher daemon"`

---

### Task 7: Inject corpus citations into task generator

**Files:**
- Modify: `src/llm/TaskGeneratorContext.ts`
- Modify: `src/types/task.ts` (add `citations` field)
- Test: `tests/llm/TaskGeneratorContext.test.ts`

- [ ] Step 1: Write test:
  ```ts
  it('injects corpus chunks into system prompt before LLM call', async () => {
    const retriever = { query: vi.fn().mockResolvedValue([{ source_path: 'src/auth.ts', chunk_text: 'token handling', score: 0.9, commit_hash: null }]) };
    const ctx = new TaskGeneratorContext({ retriever, projectId: 'proj-1' });
    const prompt = await ctx.buildSystemPrompt('auth token meeting transcript');
    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('token handling');
  });
  it('attaches citations[] to each generated task', async () => { /* assert task.citations has source_path entries */ });
  ```
- [ ] Step 2: Run → expect FAIL.
- [ ] Step 3: In `TaskGeneratorContext.buildSystemPrompt(transcriptText)`:
  - Call `retriever.query(transcriptText.slice(0, 500), projectId, 5)`.
  - Append retrieved chunks as a `## Local KB Context` section in the system prompt.
  - After task generation, map citations back to each task's `citations[]` field (include in JSON output schema via `CITATIONS_SCHEMA`).
- [ ] Step 4: Run → expect PASS.
- [ ] Step 5: `git add src/llm/TaskGeneratorContext.ts src/types/task.ts tests/llm/TaskGeneratorContext.test.ts && git commit -m "feat(corpus): inject corpus citations into task generator context"`

---

### Task 8: NotebookLM upload deny-list enforcement

**Files:**
- Modify: `src/services/UploadUtility.ts`
- Test: `tests/services/UploadUtility.test.ts`

- [ ] Step 1: Write security test:
  ```ts
  it('throws CorpusLeakError when corpus path is in upload payload', async () => {
    const util = new UploadUtility({ corpusDenyList: ['/Users/g/projects'] });
    await expect(util.upload({ content: '...', sourcePath: '/Users/g/projects/app/foo.ts' }))
      .rejects.toThrow(CorpusLeakError);
  });
  ```
- [ ] Step 2: Run → expect FAIL.
- [ ] Step 3: In `UploadUtility.upload(payload)`: before any network call, check `payload.sourcePath` against `CORPUS_DENY_LIST` (loaded from corpus config `rootPaths`). If match → throw `CorpusLeakError('Corpus path blocked from upload')`.
- [ ] Step 4: Run → expect PASS.
- [ ] Step 5: `git add src/services/UploadUtility.ts tests/services/UploadUtility.test.ts && git commit -m "security(corpus): enforce NotebookLM upload deny-list for corpus paths"`
