import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

/**
 * Load the sqlite-vec extension into a better-sqlite3 database connection.
 * In dev mode, uses the npm package loader. In production, resolves the
 * platform-specific binary from the asar-unpacked path.
 *
 * Does NOT throw on failure — logs a warning and allows graceful degradation.
 */
export function loadSqliteVec(db: Database.Database): void {
  try {
    if (!app.isPackaged) {
      // Dev mode: use the npm package's built-in loader
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sqliteVec = require('sqlite-vec');
      sqliteVec.load(db);
    } else {
      // Production: resolve platform binary from asar-unpacked
      const platform = process.platform; // 'darwin', 'linux', 'win32'
      const arch = process.arch; // 'arm64', 'x64'
      const os = platform === 'win32' ? 'windows' : platform;
      const ext = platform === 'darwin' ? 'dylib' : platform === 'win32' ? 'dll' : 'so';
      const pkgName = `sqlite-vec-${os}-${arch}`;
      const extPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        pkgName,
        `vec0.${ext}`
      );
      db.loadExtension(extPath);
    }
  } catch (err) {
    console.warn('[vecLoader] sqlite-vec unavailable, vector search will be disabled:', err);
  }
}
