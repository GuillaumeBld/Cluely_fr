import path from 'path';
import { app } from 'electron';

const ALLOWED_DIRS = [
  () => app.getPath('userData'),
  () => app.getPath('temp'),
];

/**
 * Validate that a file path is within allowed directories.
 * Prevents path-traversal attacks from renderer-supplied paths.
 */
export function validateFilePath(filePath: string): boolean {
  if (typeof filePath !== 'string' || !filePath.trim()) return false;
  const resolved = path.resolve(filePath);
  return ALLOWED_DIRS.some(dirFn => {
    try {
      return resolved.startsWith(dirFn() + path.sep) || resolved === dirFn();
    } catch {
      return false;
    }
  });
}

/**
 * Validate a URL against an allowlist of protocols.
 */
export function validateUrl(url: string, allowedProtocols = ['http:', 'https:']): boolean {
  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}
