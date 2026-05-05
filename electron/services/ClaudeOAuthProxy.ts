import http from 'http';
import { spawn } from 'child_process';
import { AddressInfo } from 'net';

/**
 * Local HTTP proxy that forwards chat requests to the user's Claude Code CLI,
 * reusing their existing OAuth/Max subscription. Exposes an OpenAI-compatible
 * /v1/chat/completions endpoint so it plugs into the Custom Provider pipeline.
 *
 * Each request shells `claude -p --output-format json <prompt>` and returns the
 * assistant text. No streaming. Rate-limited by Claude Max quotas, not billed.
 */
export class ClaudeOAuthProxy {
    private static instance: ClaudeOAuthProxy | null = null;
    private server: http.Server | null = null;
    private port: number = 0;
    private claudeBin: string = 'claude';

    public static getInstance(): ClaudeOAuthProxy {
        if (!ClaudeOAuthProxy.instance) ClaudeOAuthProxy.instance = new ClaudeOAuthProxy();
        return ClaudeOAuthProxy.instance;
    }

    public setClaudeBin(bin: string) {
        this.claudeBin = bin;
    }

    public async start(preferredPort = 47823): Promise<number> {
        if (this.server) return this.port;

        const tryListen = (port: number, allowFallback: boolean): Promise<number> =>
            new Promise((resolve, reject) => {
                const server = http.createServer((req, res) => this.handleRequest(req, res));
                const onError = (err: NodeJS.ErrnoException) => {
                    server.removeListener('error', onError);
                    if (allowFallback && err?.code === 'EADDRINUSE') {
                        console.warn(`[ClaudeOAuthProxy] Port ${port} in use, falling back to random.`);
                        tryListen(0, false).then(resolve, reject);
                    } else {
                        reject(err);
                    }
                };
                server.on('error', onError);
                server.listen(port, '127.0.0.1', () => {
                    server.removeListener('error', onError);
                    const addr = server.address() as AddressInfo;
                    this.port = addr.port;
                    this.server = server;
                    console.log(`[ClaudeOAuthProxy] Listening on 127.0.0.1:${this.port}`);
                    resolve(this.port);
                });
            });

        return tryListen(preferredPort || 47823, true);
    }

    public stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.port = 0;
        }
    }

    public getPort(): number {
        return this.port;
    }

    public getBaseUrl(): string {
        return this.port ? `http://127.0.0.1:${this.port}` : '';
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        // CORS so the renderer (file:// or localhost) can call if needed
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, port: this.port }));
            return;
        }

        if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found. POST /v1/chat/completions' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                const prompt = this.buildPrompt(payload);
                const model = this.resolveModel(payload?.model);
                const fallback = typeof payload?.fallback_model === 'string' ? payload.fallback_model : undefined;
                const result = await this.runClaude(prompt, model, fallback);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000),
                    model: payload.model || 'claude-code-oauth',
                    choices: [{
                        index: 0,
                        message: { role: 'assistant', content: result },
                        finish_reason: 'stop'
                    }],
                    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
                }));
            } catch (err: any) {
                console.error('[ClaudeOAuthProxy] Request failed:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: err?.message || String(err) } }));
            }
        });
        req.on('error', err => {
            console.error('[ClaudeOAuthProxy] Request stream error:', err);
        });
    }

    private buildPrompt(payload: any): string {
        // Support both OpenAI format ({messages: [{role, content}]}) and raw {prompt}
        if (typeof payload?.prompt === 'string') return payload.prompt;

        const messages: Array<{ role: string; content: any }> = payload?.messages || [];
        const parts: string[] = [];
        for (const m of messages) {
            const content = typeof m.content === 'string'
                ? m.content
                : Array.isArray(m.content)
                    ? m.content.map((p: any) => p?.text || '').join('\n')
                    : JSON.stringify(m.content);
            if (m.role === 'system') parts.push(`[System]\n${content}`);
            else if (m.role === 'assistant') parts.push(`[Assistant]\n${content}`);
            else parts.push(content);
        }
        return parts.join('\n\n');
    }

    /**
     * Map user-facing model names to `claude --model` aliases.
     * - fast/haiku/sonnet → sonnet (cheapest Max-covered fast path)
     * - deep/opus/thinking → opus
     * - passthrough: full model IDs like "claude-opus-4-7" or "claude-sonnet-4-6"
     */
    private resolveModel(m: any): string | undefined {
        if (!m || typeof m !== 'string') return undefined;
        const s = m.toLowerCase();
        if (s === 'fast' || s === 'haiku' || s === 'sonnet' || s.includes('sonnet')) return 'sonnet';
        if (s === 'deep' || s === 'opus' || s === 'thinking' || s.includes('opus')) return 'opus';
        if (s === 'claude-code-oauth') return undefined; // use CLI default
        return m;
    }

    private runClaude(prompt: string, model?: string, fallbackModel?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const args = ['-p', '--output-format', 'json'];
            if (model) args.push('--model', model);
            if (fallbackModel) args.push('--fallback-model', fallbackModel);
            const child = spawn(this.claudeBin, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });

            let stdout = '';
            let stderr = '';
            const timeoutMs = 120_000;
            const timer = setTimeout(() => {
                try { child.kill('SIGKILL'); } catch { /* ignore */ }
                reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            child.stdout.on('data', d => { stdout += d.toString(); });
            child.stderr.on('data', d => { stderr += d.toString(); });

            child.on('error', err => {
                clearTimeout(timer);
                reject(new Error(`Failed to spawn '${this.claudeBin}': ${err.message}. Is Claude Code CLI installed and on PATH?`));
            });

            child.on('close', code => {
                clearTimeout(timer);
                if (code !== 0) {
                    return reject(new Error(`claude -p exited ${code}. stderr: ${stderr.slice(0, 500)}`));
                }
                try {
                    const parsed = JSON.parse(stdout);
                    if (parsed?.is_error) {
                        return reject(new Error(parsed?.result || parsed?.error || 'claude returned error'));
                    }
                    resolve(String(parsed?.result ?? ''));
                } catch (e: any) {
                    // Not JSON — treat as raw text
                    resolve(stdout.trim());
                }
            });

            // Send prompt on stdin so arg length isn't a constraint
            child.stdin.write(prompt);
            child.stdin.end();
        });
    }
}
