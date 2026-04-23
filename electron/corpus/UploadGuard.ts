// electron/corpus/UploadGuard.ts
// Prevents corpus data from leaking to external uploads (e.g. NotebookLM)

import path from 'path';

export class CorpusLeakError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorpusLeakError';
  }
}

export class UploadGuard {
  private denyList: string[];

  constructor(corpusRootPaths: string[]) {
    this.denyList = corpusRootPaths.map(p => path.resolve(p));
  }

  checkPath(sourcePath: string): void {
    const resolved = path.resolve(sourcePath);

    for (const denied of this.denyList) {
      if (resolved.startsWith(denied)) {
        throw new CorpusLeakError(
          `Corpus path blocked from upload: ${sourcePath} is under corpus root ${denied}`
        );
      }
    }
  }

  checkPayload(payload: { sourcePath?: string; content?: string }): void {
    if (payload.sourcePath) {
      this.checkPath(payload.sourcePath);
    }
  }
}
