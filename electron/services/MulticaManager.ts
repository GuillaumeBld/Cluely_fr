/**
 * MulticaManager.ts
 *
 * Owns the full Multica lifecycle inside Electron:
 *   - Starts/stops the Go server process
 *   - Bootstraps auth on first run (888888 master code)
 *   - Persists PAT token to ~/.multica-cluely.json
 *   - Exposes typed API methods for IPC handlers
 */

import { execFile, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import { BrowserWindow } from 'electron';
import {
    getServerBinaryPath,
    getDbUrl,
    getJwtSecret,
    PORT,
    BASE_URL,
    BOOTSTRAP_EMAIL,
    MASTER_CODE,
    CONFIG_PATH,
} from './MulticaConfig';

interface MulticaConfig {
    server_url: string;
    token: string;
    user_id: string;
    workspaces: Record<string, string>; // prefix → id
}

interface Workspace {
    id: string;
    name: string;
    slug: string;
    issue_prefix: string;
}

interface Issue {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    number: number;
    workspace_id: string;
    created_at: string;
    updated_at: string;
}

type ManagerState = 'idle' | 'bootstrapping' | 'ready' | 'failed';

export class MulticaManager {
    private static instance: MulticaManager;
    private serverProcess: ChildProcess | null = null;
    private config: MulticaConfig | null = null;
    private state: ManagerState = 'idle';
    private readyPromise: Promise<void> | null = null;
    private readyResolve: (() => void) | null = null;
    private readyReject: ((err: Error) => void) | null = null;
    private launcherWindow: BrowserWindow | null = null;

    public static getInstance(): MulticaManager {
        if (!MulticaManager.instance) {
            MulticaManager.instance = new MulticaManager();
        }
        return MulticaManager.instance;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    public async start(): Promise<void> {
        if (this.state === 'bootstrapping' || this.state === 'ready') return;
        this.state = 'bootstrapping';
        console.log('[MulticaManager] Starting...');

        this.config = this.loadConfig();
        const alreadyUp = await this.waitForHealth(1500);

        if (!alreadyUp) {
            try {
                await this.startServer();
            } catch (err) {
                console.error('[MulticaManager] Server failed to start:', err);
                this.state = 'failed';
                this.readyReject?.(err as Error);
                this.notifyRenderer('failed', (err as Error).message);
                return;
            }
            const healthy = await this.waitForHealth(10000);
            if (!healthy) {
                const err = new Error('Multica server did not become healthy in time');
                console.error('[MulticaManager]', err.message);
                this.state = 'failed';
                this.readyReject?.(err);
                this.notifyRenderer('failed', err.message);
                return;
            }
        }

        const bootstrapOk = await this.bootstrap();
        if (!bootstrapOk) {
            const err = new Error('Multica bootstrap failed');
            console.error('[MulticaManager]', err.message);
            this.state = 'failed';
            this.readyReject?.(err);
            this.notifyRenderer('failed', err.message);
            return;
        }

        this.state = 'ready';
        this.readyResolve?.();
        this.notifyRenderer('ready');
        console.log('[MulticaManager] Ready. Token:', this.config?.token?.slice(0, 16) + '...');
    }

    public stop(): void {
        if (this.serverProcess) {
            console.log('[MulticaManager] Stopping server...');
            this.serverProcess.kill('SIGTERM');
            this.serverProcess = null;
        }
        this.state = 'idle';
    }

    public isReady(): boolean {
        return this.state === 'ready';
    }

    /**
     * Returns a Promise that resolves when the server is up and authenticated.
     * Rejects if startup or bootstrap fails. Safe to call multiple times.
     */
    public waitUntilReady(): Promise<void> {
        if (this.state === 'ready') return Promise.resolve();
        if (this.state === 'failed') return Promise.reject(new Error('MulticaManager failed to start'));
        if (!this.readyPromise) {
            this.readyPromise = new Promise<void>((resolve, reject) => {
                this.readyResolve = resolve;
                this.readyReject = reject;
            });
        }
        return this.readyPromise;
    }

    public setLauncherWindow(win: BrowserWindow): void {
        this.launcherWindow = win;
    }

    // ── Server process ─────────────────────────────────────────────────────

    private startServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            const binary = getServerBinaryPath();
            if (!fs.existsSync(binary)) {
                reject(new Error(`Multica server binary not found: ${binary}`));
                return;
            }

            console.log('[MulticaManager] Launching server process...');
            this.serverProcess = execFile(
                binary,
                [],
                {
                    env: {
                        ...process.env,
                        DATABASE_URL: getDbUrl(),
                        JWT_SECRET: getJwtSecret(),
                        APP_ENV: 'development',
                        PORT: String(PORT),
                    },
                    maxBuffer: 10 * 1024 * 1024,
                }
            );

            let resolved = false;
            const resolveOnce = () => { if (!resolved) { resolved = true; resolve(); } };

            this.serverProcess.stdout?.on('data', (d) => {
                const line = d.toString().trim();
                if (line) console.log('[multica-server]', line);
                if (line.includes('server starting')) resolveOnce();
            });

            this.serverProcess.stderr?.on('data', (d) => {
                const line = d.toString().trim();
                if (line) console.error('[multica-server]', line);
                if (line.includes('server starting')) resolveOnce();
            });

            this.serverProcess.on('error', (err) => {
                console.error('[MulticaManager] Process error:', err);
                reject(err);
            });

            this.serverProcess.on('exit', (code) => {
                console.warn('[MulticaManager] Server exited with code:', code);
                this.serverProcess = null;
                if (this.state === 'ready') {
                    this.state = 'failed';
                    this.notifyRenderer('failed', `Server exited with code ${code}`);
                }
            });

            setTimeout(resolveOnce, 3000);
        });
    }

    private waitForHealth(timeoutMs: number): Promise<boolean> {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                const req = http.get(`${BASE_URL}/health`, (res) => {
                    res.resume(); // consume body so socket is released
                    if (res.statusCode === 200) {
                        resolve(true);
                    } else {
                        retry();
                    }
                });
                req.on('error', () => retry());
                req.setTimeout(1000, () => { req.destroy(); retry(); });
            };
            const retry = () => {
                if (Date.now() - start > timeoutMs) {
                    resolve(false);
                } else {
                    setTimeout(check, 400);
                }
            };
            check();
        });
    }

    // ── Auth bootstrap ─────────────────────────────────────────────────────

    private async bootstrap(): Promise<boolean> {
        try {
            console.log('[MulticaManager] Bootstrapping auth...');

            if (this.config?.token) {
                const valid = await this.checkToken();
                if (valid) return true;
                console.log('[MulticaManager] Stored token invalid, re-bootstrapping...');
            }

            await this.post('/auth/send-code', { email: BOOTSTRAP_EMAIL });
            const verifyRes = await this.post('/auth/verify-code', {
                email: BOOTSTRAP_EMAIL,
                code: MASTER_CODE,
            }) as any;

            if (!verifyRes?.token) throw new Error('verify-code did not return a JWT');

            const jwt = verifyRes.token;
            const userId = verifyRes.user?.id;

            const patRes = await this.postAuth(jwt, '/api/tokens', {
                name: 'cluely-electron',
                expires_in_days: 3650,
            }) as any;

            if (!patRes?.token) throw new Error('PAT creation failed');

            this.config = {
                server_url: BASE_URL,
                token: patRes.token,
                user_id: userId,
                workspaces: {},
            };

            await this.ensureWorkspaces();
            this.saveConfig();
            console.log('[MulticaManager] Bootstrap complete. PAT:', patRes.token.slice(0, 16) + '...');
            return true;
        } catch (err) {
            console.error('[MulticaManager] Bootstrap failed:', err);
            return false;
        }
    }

    private async ensureWorkspaces(): Promise<void> {
        if (!this.config) return;

        const existing = await this.api('/api/workspaces') as Workspace[];
        const existingNames = new Set(existing.map((w) => w.name));

        const defaults = [
            { name: 'Graduate_Researcher', slug: 'graduate-researcher', issue_prefix: 'GRA' },
            { name: 'QualiaAI', slug: 'qualiaai', issue_prefix: 'QUA' },
            { name: 'Succession', slug: 'succession', issue_prefix: 'SUC' },
        ];

        for (const ws of defaults) {
            if (!existingNames.has(ws.name)) {
                const created = await this.apiPost('/api/workspaces', ws) as Workspace;
                if (created?.id) {
                    this.config.workspaces[ws.issue_prefix] = created.id;
                }
            } else {
                const found = existing.find((w) => w.name === ws.name);
                if (found) this.config.workspaces[ws.issue_prefix] = found.id;
            }
        }
    }

    private async checkToken(): Promise<boolean> {
        try {
            const res = await this.api('/api/me');
            return !!(res as any)?.id;
        } catch {
            return false;
        }
    }

    // ── Config persistence ─────────────────────────────────────────────────

    private loadConfig(): MulticaConfig | null {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            }
        } catch { }
        return null;
    }

    private saveConfig(): void {
        if (!this.config) return;
        const tmp = CONFIG_PATH + '.tmp';
        try {
            fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), { mode: 0o600 });
            fs.renameSync(tmp, CONFIG_PATH);
        } catch (err) {
            console.error('[MulticaManager] Failed to save config:', err);
            try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        }
    }

    // ── Renderer push notifications ────────────────────────────────────────

    private notifyRenderer(status: 'ready' | 'failed', error?: string): void {
        if (!this.launcherWindow || this.launcherWindow.isDestroyed()) return;
        this.launcherWindow.webContents.send('multica-status-change', { status, error });
    }

    // ── Public API ─────────────────────────────────────────────────────────

    public getToken(): string {
        return this.config?.token || '';
    }

    public getWorkspaceId(prefix: string): string | null {
        return this.config?.workspaces[prefix] || null;
    }

    public async getWorkspaces(): Promise<Workspace[]> {
        try {
            const data = await this.api('/api/workspaces');
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    public async getIssues(workspaceId: string): Promise<Issue[]> {
        try {
            const data = await this.api(`/api/issues?workspace_id=${workspaceId}`);
            return Array.isArray(data) ? data : (data as any)?.issues || [];
        } catch {
            return [];
        }
    }

    public async createIssue(opts: {
        workspaceId: string;
        title: string;
        description?: string;
        priority?: string;
        status?: string;
    }): Promise<Issue | null> {
        try {
            const result = await this.apiPost(`/api/issues?workspace_id=${opts.workspaceId}`, {
                title: opts.title,
                description: opts.description || '',
                priority: opts.priority || 'medium',
                status: opts.status || 'backlog',
            });
            return result as Issue;
        } catch (err) {
            console.error('[MulticaManager] createIssue failed:', err);
            return null;
        }
    }

    public async createIssues(workspaceId: string, items: string[], meetingTitle: string): Promise<void> {
        const results = await Promise.allSettled(
            items.map((item) =>
                this.createIssue({
                    workspaceId,
                    title: item,
                    description: `Action item from meeting: "${meetingTitle}"`,
                    priority: 'medium',
                    status: 'backlog',
                })
            )
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
            console.warn(`[MulticaManager] ${failed}/${items.length} issues failed to create`);
        }
    }

    public async updateToken(token: string): Promise<void> {
        if (!token.startsWith('mul_')) return;
        if (!this.config) this.config = { server_url: BASE_URL, token, user_id: '', workspaces: {} };
        this.config.token = token;
        this.saveConfig();
    }

    public async createWorkspace(name: string, slug: string): Promise<unknown> {
        return this.apiPost('/api/workspaces', { name, slug });
    }

    // ── HTTP helpers ───────────────────────────────────────────────────────

    private fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { ...opts, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    }

    private fetchJson(url: string, opts: RequestInit = {}, timeoutMs = 10000): Promise<unknown> {
        return this.fetchWithTimeout(url, opts, timeoutMs).then(async (res) => {
            const text = await res.text();
            let parsed: unknown;
            try { parsed = JSON.parse(text); } catch { parsed = text; }
            if (!res.ok) {
                const msg = (parsed as any)?.error || text || `HTTP ${res.status}`;
                throw new Error(`[Multica] ${res.status} ${msg}`);
            }
            return parsed;
        });
    }

    private async api(endpoint: string): Promise<unknown> {
        const token = this.config?.token || '';
        return this.fetchJson(`${BASE_URL}${endpoint}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
    }

    private async apiPost(endpoint: string, body: unknown): Promise<unknown> {
        const token = this.config?.token || '';
        return this.fetchJson(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
    }

    private async post(endpoint: string, body: unknown): Promise<unknown> {
        return this.fetchJson(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    private async postAuth(jwt: string, endpoint: string, body: unknown): Promise<unknown> {
        return this.fetchJson(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify(body),
        });
    }
}
