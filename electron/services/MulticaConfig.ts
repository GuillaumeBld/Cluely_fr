import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { app } from 'electron';

const SECRET_PATH = path.join(os.homedir(), '.multica-cluely-secret');
export const CONFIG_PATH = path.join(os.homedir(), '.multica-cluely.json');

/**
 * Resolve the Go server binary path relative to the Electron app bundle.
 * Dev:      <project-root>/../../multica-server/bin/multica-server
 * Packaged: <resourcesPath>/multica-server
 */
export function getServerBinaryPath(): string {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'multica-server');
    }
    const appPath = app.getAppPath();
    return path.join(appPath, '..', '..', 'multica-server', 'bin', 'multica-server');
}

/** DB URL from env var, falling back to local dev default. Never hardcode credentials in source. */
export function getDbUrl(): string {
    if (process.env.MULTICA_DB_URL) return process.env.MULTICA_DB_URL;
    return 'postgres://multica:multica123@localhost:5432/multica_cluely?sslmode=disable';
}

/** Load or generate the JWT signing secret — stored in ~/.multica-cluely-secret (mode 0o600). */
export function getJwtSecret(): string {
    if (process.env.MULTICA_JWT_SECRET) return process.env.MULTICA_JWT_SECRET;
    try {
        if (fs.existsSync(SECRET_PATH)) {
            return fs.readFileSync(SECRET_PATH, 'utf8').trim();
        }
    } catch { /* fall through to generate */ }
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
    return secret;
}

export const PORT = Number(process.env.MULTICA_PORT) || 8091;
export const BASE_URL = `http://localhost:${PORT}`;
export const BOOTSTRAP_EMAIL = 'admin@cluely.local';
export const MASTER_CODE = '888888';
