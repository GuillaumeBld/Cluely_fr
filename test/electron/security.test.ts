import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron app before importing
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/userData';
      if (name === 'temp') return '/mock/temp';
      return '/mock/other';
    }),
  },
}));

import { validateFilePath, validateUrl } from '../../electron/security';

describe('validateFilePath', () => {
  it('allows paths within userData', () => {
    expect(validateFilePath('/mock/userData/screenshots/img.png')).toBe(true);
  });

  it('allows paths within temp', () => {
    expect(validateFilePath('/mock/temp/file.tmp')).toBe(true);
  });

  it('rejects paths outside allowed directories', () => {
    expect(validateFilePath('/etc/passwd')).toBe(false);
    expect(validateFilePath('/home/user/.ssh/id_rsa')).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    expect(validateFilePath('/mock/userData/../../../etc/passwd')).toBe(false);
    expect(validateFilePath('/mock/userData/screenshots/../../..')).toBe(false);
  });

  it('rejects empty or non-string input', () => {
    expect(validateFilePath('')).toBe(false);
    expect(validateFilePath('   ')).toBe(false);
    expect(validateFilePath(null as any)).toBe(false);
    expect(validateFilePath(undefined as any)).toBe(false);
  });
});

describe('validateUrl', () => {
  it('allows http and https URLs', () => {
    expect(validateUrl('https://example.com')).toBe(true);
    expect(validateUrl('http://localhost:11434')).toBe(true);
  });

  it('rejects file: and other protocols', () => {
    expect(validateUrl('file:///etc/passwd')).toBe(false);
    expect(validateUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateUrl('not a url')).toBe(false);
    expect(validateUrl('')).toBe(false);
  });
});
