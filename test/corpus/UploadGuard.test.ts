import { describe, it, expect } from 'vitest';
import { UploadGuard, CorpusLeakError } from '../../electron/corpus/UploadGuard';

describe('UploadGuard', () => {
  it('throws CorpusLeakError when source path is under corpus root', () => {
    const guard = new UploadGuard(['/Users/g/projects']);

    expect(() => {
      guard.checkPath('/Users/g/projects/app/foo.ts');
    }).toThrow(CorpusLeakError);
  });

  it('allows paths outside corpus roots', () => {
    const guard = new UploadGuard(['/Users/g/projects']);

    expect(() => {
      guard.checkPath('/Users/g/documents/notes.md');
    }).not.toThrow();
  });

  it('checks payload sourcePath field', () => {
    const guard = new UploadGuard(['/Users/g/projects']);

    expect(() => {
      guard.checkPayload({ sourcePath: '/Users/g/projects/app/secret.ts', content: 'data' });
    }).toThrow(CorpusLeakError);
  });

  it('allows payload without sourcePath', () => {
    const guard = new UploadGuard(['/Users/g/projects']);

    expect(() => {
      guard.checkPayload({ content: 'just text' });
    }).not.toThrow();
  });

  it('handles multiple corpus roots', () => {
    const guard = new UploadGuard(['/Users/g/work', '/Users/g/oss']);

    expect(() => guard.checkPath('/Users/g/work/app/a.ts')).toThrow(CorpusLeakError);
    expect(() => guard.checkPath('/Users/g/oss/lib/b.ts')).toThrow(CorpusLeakError);
    expect(() => guard.checkPath('/Users/g/other/c.ts')).not.toThrow();
  });

  it('error message includes blocked path', () => {
    const guard = new UploadGuard(['/corpus']);

    try {
      guard.checkPath('/corpus/secret.ts');
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(CorpusLeakError);
      expect(err.message).toContain('/corpus/secret.ts');
      expect(err.message).toContain('Corpus path blocked');
    }
  });
});
