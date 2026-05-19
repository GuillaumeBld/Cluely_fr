/**
 * WorkspaceRouter — learns which workspace (Multica espace) a meeting belongs to
 * based on attendee emails.
 *
 * Storage: `workspace_routing` table in the app SQLite DB.
 * Schema:
 *   key TEXT PRIMARY KEY  — email address or @domain suffix (e.g. "@luc.edu")
 *   workspace_id TEXT     — Multica workspace UUID
 *   weight INTEGER        — vote count; higher = more confident; starts at 1
 *
 * Scoring:
 *   For a given set of attendees, each matching key contributes `weight` votes
 *   to its workspace. The workspace with the most votes wins.
 *   Confidence = winning_votes / total_votes (0–1).
 */

import Database from 'better-sqlite3';

export interface RoutingResult {
    workspaceId: string;
    confidence: number; // 0–1
    matchedKeys: string[]; // which emails/domains triggered the match
}

export class WorkspaceRouter {
    private db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
        this.ensureTable();
    }

    private ensureTable(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS workspace_routing (
                key          TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                weight       INTEGER NOT NULL DEFAULT 1
            );
        `);
    }

    /**
     * Classify a meeting from its attendee email list.
     * Returns null if no routing data exists yet.
     */
    public classify(attendees: string[]): RoutingResult | null {
        if (!attendees.length) return null;

        const keys = this.buildKeys(attendees);
        if (!keys.length) return null;

        const placeholders = keys.map(() => '?').join(',');
        const rows = this.db.prepare(
            `SELECT key, workspace_id, weight FROM workspace_routing WHERE key IN (${placeholders})`
        ).all(...keys) as { key: string; workspace_id: string; weight: number }[];

        if (!rows.length) return null;

        // Tally votes per workspace
        const votes: Record<string, number> = {};
        const matched: Record<string, string[]> = {};
        for (const row of rows) {
            votes[row.workspace_id] = (votes[row.workspace_id] || 0) + row.weight;
            matched[row.workspace_id] = [...(matched[row.workspace_id] || []), row.key];
        }

        const total = Object.values(votes).reduce((s, v) => s + v, 0);
        const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];

        return {
            workspaceId: winner[0],
            confidence: winner[1] / total,
            matchedKeys: matched[winner[0]] || [],
        };
    }

    /**
     * Record a confirmed workspace assignment for a set of attendees.
     * Increments weight for existing entries, inserts new ones.
     * Call this when the user confirms (or overrides) a workspace assignment.
     */
    public learn(attendees: string[], workspaceId: string): void {
        const keys = this.buildKeys(attendees);
        const upsert = this.db.prepare(`
            INSERT INTO workspace_routing (key, workspace_id, weight)
            VALUES (?, ?, 1)
            ON CONFLICT(key) DO UPDATE SET
                workspace_id = excluded.workspace_id,
                weight = weight + 1
        `);

        const tx = this.db.transaction(() => {
            for (const key of keys) {
                upsert.run(key, workspaceId);
            }
        });
        tx();

        console.log(`[WorkspaceRouter] Learned ${keys.length} keys → workspace ${workspaceId}`);
    }

    /**
     * Remove all routing entries for a workspace (e.g. when workspace is deleted).
     */
    public forget(workspaceId: string): void {
        this.db.prepare('DELETE FROM workspace_routing WHERE workspace_id = ?').run(workspaceId);
    }

    /**
     * Get all routing rules (for display in settings).
     */
    public getRules(): { key: string; workspace_id: string; weight: number }[] {
        return this.db.prepare(
            'SELECT key, workspace_id, weight FROM workspace_routing ORDER BY weight DESC'
        ).all() as { key: string; workspace_id: string; weight: number }[];
    }

    private buildKeys(attendees: string[]): string[] {
        const keys = new Set<string>();
        for (const email of attendees) {
            const e = email.trim().toLowerCase();
            if (!e.includes('@')) continue;
            keys.add(e); // exact email
            const domain = '@' + e.split('@')[1];
            keys.add(domain); // domain wildcard
        }
        return [...keys];
    }
}
