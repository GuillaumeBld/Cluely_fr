import { execFile } from 'child_process';
import { EventEmitter } from 'events';

/**
 * ZoomWatcher — polls for Zoom process and detects when a meeting starts.
 * Emits 'zoom-meeting-started' when Zoom appears (first detection).
 * Emits 'zoom-meeting-ended' when Zoom disappears after having been running.
 */
export class ZoomWatcher extends EventEmitter {
    private static instance: ZoomWatcher;
    private pollInterval: NodeJS.Timeout | null = null;
    private zoomRunning = false;
    private readonly POLL_MS = 5000; // Check every 5 seconds

    public static getInstance(): ZoomWatcher {
        if (!ZoomWatcher.instance) {
            ZoomWatcher.instance = new ZoomWatcher();
        }
        return ZoomWatcher.instance;
    }

    public start(): void {
        if (this.pollInterval) return; // Already running
        console.log('[ZoomWatcher] Starting Zoom process monitor...');
        this.pollInterval = setInterval(() => this.check(), this.POLL_MS);
        // Run immediately on start
        this.check();
    }

    public stop(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        console.log('[ZoomWatcher] Stopped.');
    }

    private check(): void {
        // Use pgrep with fixed args — no shell injection possible
        execFile('pgrep', ['-x', 'zoom.us'], (err, stdout) => {
            const isRunning = !err && stdout.trim().length > 0;

            if (isRunning && !this.zoomRunning) {
                console.log('[ZoomWatcher] Zoom detected — meeting may have started.');
                this.zoomRunning = true;
                // Small delay to let Zoom settle before showing Cluely
                setTimeout(() => this.emit('zoom-meeting-started'), 2000);
            } else if (!isRunning && this.zoomRunning) {
                console.log('[ZoomWatcher] Zoom closed.');
                this.zoomRunning = false;
                this.emit('zoom-meeting-ended');
            }
        });
    }

    public isZoomRunning(): boolean {
        return this.zoomRunning;
    }
}
