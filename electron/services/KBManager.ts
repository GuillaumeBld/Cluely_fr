import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MulticaManager } from './MulticaManager';

const KB_ROOT = process.env.CLUELY_KB_ROOT || '/Volumes/SanDisk/dev/knowledge-base/cluely-multica';
const SCRIPTS = path.join(KB_ROOT, 'scripts');

/**
 * KBManager — bridges Cluely to the shared Cluely-Multica knowledge base.
 *
 * On meeting end: writes transcript + action items to local KB, syncs to NotebookLM.
 * On meeting start: queries NotebookLM for context on attendees/topics.
 */
export class KBManager {
    private static instance: KBManager;

    public static getInstance(): KBManager {
        if (!KBManager.instance) {
            KBManager.instance = new KBManager();
        }
        return KBManager.instance;
    }

    /**
     * Called after a meeting ends and summary is generated.
     * Writes the meeting to the KB and syncs to NotebookLM.
     */
    public async onMeetingEnd(opts: {
        title: string;
        transcript: string;
        actionItems: string[];
        attendees?: string[];
        screenshots?: Array<{ path: string; timestamp: number; label?: string }>;
    }): Promise<void> {
        const { title, transcript, actionItems, attendees, screenshots } = opts;

        console.log('[KBManager] Writing meeting to KB:', title);

        const args = [
            path.join(SCRIPTS, 'write-meeting.js'),
            '--title', title,
            '--transcript', transcript,
        ];

        if (actionItems.length > 0) {
            args.push('--actions', actionItems.join('|'));
        }
        if (attendees && attendees.length > 0) {
            args.push('--attendees', attendees.join(','));
        }
        if (screenshots && screenshots.length > 0) {
            // Pass as JSON string: path:timestamp pairs
            args.push('--screenshots', JSON.stringify(screenshots.map(s => ({ path: s.path, timestamp: s.timestamp, label: s.label }))));
        }

        return new Promise((resolve) => {
            execFile('node', args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) {
                    console.error('[KBManager] write-meeting failed:', err.message);
                    if (stderr) console.error(stderr);
                } else {
                    if (stdout) console.log('[KBManager]', stdout.trim());
                    console.log('[KBManager] Meeting written and synced to NotebookLM.');
                }
                resolve(); // Never block Cluely on KB failures
            });
        });
    }

    /**
     * Called before a meeting starts.
     * Queries NotebookLM for context on the upcoming meeting.
     * Returns a context string to inject into the Cluely overlay, or null on failure.
     */
    public async getPreCallContext(opts: {
        title?: string;
        attendees?: string[];
    }): Promise<string | null> {
        const { title, attendees } = opts;

        const parts: string[] = [];
        if (attendees && attendees.length > 0) parts.push(`attendees: ${attendees.join(', ')}`);
        if (title) parts.push(`topic: ${title}`);

        if (parts.length === 0) return null;

        const question = `What do I know about this upcoming meeting? ${parts.join(', ')}. Summarize open tasks, past decisions, and anything relevant. Be concise.`;

        console.log('[KBManager] Querying KB for pre-call context...');

        return new Promise((resolve) => {
            execFile(
                'node',
                [path.join(SCRIPTS, 'query-kb.js'), question],
                { maxBuffer: 5 * 1024 * 1024, timeout: 15000 },
                (err, stdout, stderr) => {
                    if (err) {
                        console.error('[KBManager] query-kb failed:', err.message);
                        resolve(null);
                    } else {
                        const result = stdout.trim();
                        console.log('[KBManager] Pre-call context retrieved.');
                        resolve(result || null);
                    }
                }
            );
        });
    }

    /**
     * Push action items as issues to a Multica workspace after a meeting.
     * Uses MulticaManager for auth — fire-and-forget, never blocks Cluely.
     */
    public async pushIssuesToMultica(opts: {
        workspaceId: string;
        actionItems: string[];
        meetingTitle: string;
    }): Promise<void> {
        const { workspaceId, actionItems, meetingTitle } = opts;
        if (!actionItems.length) return;

        const multica = MulticaManager.getInstance();
        try {
            await multica.waitUntilReady();
        } catch {
            console.warn('[KBManager] MulticaManager not available — skipping issue push');
            return;
        }

        console.log(`[KBManager] Pushing ${actionItems.length} issues to Multica workspace ${workspaceId}`);
        await multica.createIssues(workspaceId, actionItems, meetingTitle);
        console.log('[KBManager] Issues pushed to Multica.');
    }

    /**
     * Check if KB scripts are available.
     */
    public isAvailable(): boolean {
        return fs.existsSync(path.join(SCRIPTS, 'write-meeting.js')) &&
               fs.existsSync(path.join(SCRIPTS, 'query-kb.js'));
    }
}
