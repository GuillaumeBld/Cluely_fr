import { app, safeStorage, shell, net } from 'electron';
import axios from 'axios';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { EventEmitter } from 'events';

// Configuration
// In a real app, these should be in environment variables or build configs
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "YOUR_CLIENT_ID_HERE";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "YOUR_CLIENT_SECRET_HERE";
const REDIRECT_URI = "http://localhost:11111/auth/callback";
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const TOKEN_PATH = path.join(app.getPath('userData'), 'calendar_tokens.enc');

if (GOOGLE_CLIENT_ID === "YOUR_CLIENT_ID_HERE" || GOOGLE_CLIENT_SECRET === "YOUR_CLIENT_SECRET_HERE") {
    console.warn('[CalendarManager] Google OAuth credentials are using defaults. Calendar features will not work until valid credentials are provided via env vars.');
}

export interface CalendarEvent {
    id: string;
    title: string;
    startTime: string; // ISO
    endTime: string; // ISO
    link?: string;
    source: 'google';
}

export class CalendarManager extends EventEmitter {
    private static instance: CalendarManager;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private expiryDate: number | null = null;
    private isConnected: boolean = false;
    private updateInterval: NodeJS.Timeout | null = null;
    private cachedEvents: CalendarEvent[] | null = null;
    private cacheExpiry: number = 0;
    private static CACHE_TTL_MS = 60_000; // re-run osascript at most once per minute

    private constructor() {
        super();
        // Tokens loaded in init() to ensure safeStorage is ready
    }

    public static getInstance(): CalendarManager {
        if (!CalendarManager.instance) {
            CalendarManager.instance = new CalendarManager();
        }
        return CalendarManager.instance;
    }

    public init() {
        this.loadTokens();
        // On macOS, system calendar is always available — mark as ready so UI shows events
        if (this.isSystemCalendarAvailable() && !this.isConnected) {
            this.isConnected = true; // System calendar needs no auth
            this.emit('connection-changed', true);
            this.fetchUpcomingEvents();
        }
    }

    // =========================================================================
    // Auth Flow
    // =========================================================================

    public async startAuthFlow(): Promise<void> {
        return new Promise((resolve, reject) => {
            // 1. Create Loopback Server
            const server = http.createServer(async (req, res) => {
                try {
                    if (req.url?.startsWith('/auth/callback')) {
                        const qs = new url.URL(req.url, 'http://localhost:11111').searchParams;
                        const code = qs.get('code');
                        const error = qs.get('error');

                        if (error) {
                            res.end('Authentication failed! You can close this window.');
                            server.close();
                            reject(new Error(error));
                            return;
                        }

                        if (code) {
                            res.end('Authentification réussie ! Vous pouvez fermer cette fenêtre et retourner sur Cluely.fr.');
                            server.close();

                            // 2. Exchange code for tokens
                            await this.exchangeCodeForToken(code);
                            resolve();
                        }
                    }
                } catch (err) {
                    res.end('Authentication error.');
                    server.close();
                    reject(err);
                }
            });

            server.listen(11111, () => {
                // 3. Open Browser
                const authUrl = this.getAuthUrl();
                shell.openExternal(authUrl);
            });

            server.on('error', (err) => {
                reject(err);
            });
        });
    }

    public async disconnect(): Promise<void> {
        this.accessToken = null;
        this.refreshToken = null;
        this.expiryDate = null;
        this.isConnected = false;

        if (fs.existsSync(TOKEN_PATH)) {
            fs.unlinkSync(TOKEN_PATH);
        }

        this.emit('connection-changed', false);
    }

    public getConnectionStatus(): { connected: boolean; email?: string, lastSync?: number } {
        // We don't store email in tokens usually, but we could fetch it.
        // For now, simpler boolean.
        return { connected: this.isConnected };
    }

    private getAuthUrl(): string {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: SCOPES.join(' '),
            access_type: 'offline', // For refresh token
            prompt: 'consent' // Force prompts to ensure we get refresh token
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    private async exchangeCodeForToken(code: string) {
        try {
            const response = await axios.post('https://oauth2.googleapis.com/token', {
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            });

            this.handleTokenResponse(response.data);
        } catch (error) {
            console.error('[CalendarManager] Token exchange failed:', error);
            throw error;
        }
    }

    // =========================================================================
    // Refresh Logic (NEW)
    // =========================================================================

    public async refreshState(): Promise<void> {
        console.log('[CalendarManager] Refreshing state (Reality Reconciliation)...');

        // 1. Reset Soft Heuristics
        // Clear existing reminder timeouts to prevent double scheduling or stale alerts
        this.reminderTimeouts.forEach(t => clearTimeout(t));
        this.reminderTimeouts = [];

        // 2. Calendar Re-sync & Temporal Re-evaluation
        if (this.isConnected) {
            // Force fetch will also re-schedule reminders based on NEW time
            await this.getUpcomingEvents(true);
        } else {
            console.log('[CalendarManager] Calendar not connected, skipping fetch.');
        }

        // 3. Emit update to UI
        // We emit 'updated' so the frontend knows to re-fetch via getUpcomingEvents
        // or we could push the data. usually ipcHandlers just call getUpcomingEvents.
        this.emit('events-updated');
    }

    private handleTokenResponse(data: any) {
        this.accessToken = data.access_token;
        if (data.refresh_token) {
            this.refreshToken = data.refresh_token; // Only returned on first consent
        }
        this.expiryDate = Date.now() + (data.expires_in * 1000);
        this.isConnected = true;
        this.saveTokens();
        this.emit('connection-changed', true);

        // Initial fetch
        this.fetchUpcomingEvents();
    }

    private async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await axios.post('https://oauth2.googleapis.com/token', {
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token'
            });

            this.handleTokenResponse(response.data);
        } catch (error) {
            console.error('[CalendarManager] Token refresh failed:', error);
            // If refresh fails (e.g. revoked), disconnect
            this.disconnect();
        }
    }

    // =========================================================================
    // Token Storage (Encrypted)
    // =========================================================================

    private saveTokens() {
        if (!safeStorage.isEncryptionAvailable()) {
            console.warn('[CalendarManager] Encryption not available, skipping token save');
            return;
        }

        const data = JSON.stringify({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            expiryDate: this.expiryDate
        });

        const encrypted = safeStorage.encryptString(data);
        fs.writeFileSync(TOKEN_PATH, encrypted);
    }

    private loadTokens() {
        if (!fs.existsSync(TOKEN_PATH)) return;

        try {
            if (!safeStorage.isEncryptionAvailable()) return;

            const encrypted = fs.readFileSync(TOKEN_PATH);
            const decrypted = safeStorage.decryptString(encrypted);
            const data = JSON.parse(decrypted);

            this.accessToken = data.accessToken;
            this.refreshToken = data.refreshToken;
            this.expiryDate = data.expiryDate;

            if (this.accessToken && this.refreshToken) {
                this.isConnected = true;
                // Check expiry
                if (this.expiryDate && Date.now() >= this.expiryDate) {
                    this.refreshAccessToken();
                }
            }
        } catch (error) {
            console.error('[CalendarManager] Failed to load tokens:', error);
        }
    }

    // =========================================================================
    // Reminders
    // =========================================================================

    private reminderTimeouts: NodeJS.Timeout[] = [];

    private scheduleReminders(events: CalendarEvent[]) {
        // Clear existing
        this.reminderTimeouts.forEach(t => clearTimeout(t));
        this.reminderTimeouts = [];

        const now = Date.now();

        events.forEach(event => {
            const startStr = event.startTime;
            if (!startStr) return;

            const startTime = new Date(startStr).getTime();
            // Reminder time: 2 minutes before
            const reminderTime = startTime - (2 * 60 * 1000);

            if (reminderTime > now) {
                const delay = reminderTime - now;
                // Only schedule if within next 24h (which fetch already limits)
                if (delay < 24 * 60 * 60 * 1000) {
                    const timeout = setTimeout(() => {
                        this.showNotification(event);
                    }, delay);
                    this.reminderTimeouts.push(timeout);
                }
            }
        });
    }

    private showNotification(event: CalendarEvent) {
        const { Notification } = require('electron');
        const notif = new Notification({
            title: 'Réunion imminente',
            body: `"${event.title}" commence dans 2 minutes. Démarrer Cluely.fr ?`,
            actions: [
                { type: 'button', text: 'Démarrer la réunion' },
                { type: 'button', text: 'Ignorer' }
            ],
            sound: true
        });

        notif.on('action', (event_unused: any, index: number) => {
            if (index === 0) {
                // Start Meeting
                // We need to tell the main process to open window and start meeting
                // Ideally we emit an event that AppState listens to
                this.emit('start-meeting-requested', event);
            }
        });

        notif.on('click', () => {
            // Just open window
            this.emit('open-requested');
        });

        notif.show();
    }

    // =========================================================================
    // Fetch Logic
    // =========================================================================

    public async getUpcomingEvents(force: boolean = false): Promise<CalendarEvent[]> {
        if (!force && this.cachedEvents && Date.now() < this.cacheExpiry) {
            return this.cachedEvents;
        }

        const results: CalendarEvent[] = [];

        // Source 1: macOS system calendar (Outlook, Gmail, iCloud — whatever's synced)
        if (this.isSystemCalendarAvailable()) {
            const sysEvents = await this.getSystemCalendarEvents(7);
            results.push(...sysEvents);
        }

        // Source 2: Google Calendar via OAuth (if connected and credentials configured)
        if (this.isConnected && this.accessToken) {
            if (this.expiryDate && Date.now() >= this.expiryDate - 60000) {
                await this.refreshAccessToken();
            }
            const googleEvents = await this.fetchEventsInternal();
            // Deduplicate: skip Google events already present from system calendar (same title + start)
            for (const ge of googleEvents) {
                const duplicate = results.some(e =>
                    e.title === ge.title &&
                    Math.abs(new Date(e.startTime).getTime() - new Date(ge.startTime).getTime()) < 60000
                );
                if (!duplicate) results.push(ge);
            }
        }

        // Sort merged results
        results.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        this.cachedEvents = results;
        this.cacheExpiry = Date.now() + CalendarManager.CACHE_TTL_MS;

        this.scheduleReminders(results);
        return results;
    }

    private async fetchEventsInternal(): Promise<CalendarEvent[]> {
        if (!this.accessToken) return [];

        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        try {
            const response = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`
                },
                params: {
                    timeMin: now.toISOString(),
                    timeMax: tomorrow.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime'
                }
            });

            const items = response.data.items || [];

            return items
                .filter((item: any) => {
                    // Filter: >= 5 mins, no all-day
                    if (!item.start.dateTime || !item.end.dateTime) return false; // All-day events have .date instead of .dateTime

                    const start = new Date(item.start.dateTime).getTime();
                    const end = new Date(item.end.dateTime).getTime();
                    const durationMins = (end - start) / 60000;

                    return durationMins >= 5;
                })
                .map((item: any) => ({
                    id: item.id,
                    title: item.summary || '(No Title)',
                    startTime: item.start.dateTime,
                    endTime: item.end.dateTime,
                    link: this.resolveMeetingLink(item),
                    source: 'google'
                }));

        } catch (error) {
            console.error('[CalendarManager] Failed to fetch events:', error);
            return [];
        }
    }

    // Intelligent Link Extraction
    private resolveMeetingLink(item: any): string | undefined {
        // 1. Prefer explicit Hangout link (Google Meet) if valid
        if (item.hangoutLink) return item.hangoutLink;

        // 2. Parse description for other providers
        if (!item.description) return undefined;

        return this.extractMeetingLink(item.description);
    }

    private extractMeetingLink(description: string): string | undefined {
        // Regex for common meeting providers
        // Matches zoom.us, teams.microsoft.com, meet.google.com, webex.com
        const providerRegex = /(https?:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex\.com)\/[^\s<>"']+)/gi;

        const matches = description.match(providerRegex);
        if (matches && matches.length > 0) {
            // Deduplicate
            const unique = [...new Set(matches)];
            // Return the first valid provider link
            return unique[0];
        }

        // Fallback: Generic URL (less strict, but riskier)
        // const genericUrlRegex = /(https?:\/\/[^\s<>"']+)/g;
        // ... avoided to prevent picking up random links like "docs.google.com"

        return undefined;
    }

    // Background fetcher could go here if needed
    public async fetchUpcomingEvents() {
        return this.getUpcomingEvents();
    }

    // =========================================================================
    // macOS System Calendar (reads all synced accounts: Outlook, Gmail, iCloud)
    // No OAuth needed — uses whatever the user has set up in Calendar.app
    // =========================================================================

    public isSystemCalendarAvailable(): boolean {
        return process.platform === 'darwin';
    }

    public async getSystemCalendarEvents(daysAhead: number = 7): Promise<CalendarEvent[]> {
        if (!this.isSystemCalendarAvailable()) return [];

        // AppleScript that queries all calendars and returns JSON-like lines
        // Format: title|||startISO|||endISO|||calendarName|||location
        const script = `
set startDate to current date
set endDate to startDate + (${daysAhead} * days)
set output to ""
tell application "Calendar"
  repeat with cal in calendars
    try
      set evts to (every event of cal whose start date >= startDate and start date <= endDate)
      repeat with e in evts
        try
          set evtTitle to summary of e
          set evtStart to start date of e
          set evtEnd to end date of e
          set evtCal to name of cal
          set evtLoc to ""
          try
            set evtLoc to location of e
          end try
          if evtLoc is missing value then set evtLoc to ""
          set output to output & evtTitle & "|||" & (evtStart as string) & "|||" & (evtEnd as string) & "|||" & evtCal & "|||" & evtLoc & "\n"
        end try
      end repeat
    end try
  end repeat
end tell
return output
        `.trim();

        return new Promise((resolve) => {
            execFile('osascript', ['-e', script], { timeout: 10000 }, (err, stdout, stderr) => {
                if (err) {
                    console.error('[CalendarManager] osascript failed:', err.message);
                    resolve([]);
                    return;
                }

                const lines = stdout.trim().split('\n').filter(l => l.includes('|||'));
                const events: CalendarEvent[] = [];

                for (const line of lines) {
                    try {
                        const parts = line.split('|||');
                        if (parts.length < 4) continue;

                        const [title, startStr, endStr, calName, location] = parts;
                        const startTime = this.parseAppleScriptDate(startStr.trim());
                        const endTime = this.parseAppleScriptDate(endStr.trim());

                        if (!startTime || !endTime) continue;

                        // Skip all-day events (duration >= 23h and starts at midnight)
                        const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
                        if (durationMs >= 23 * 60 * 60 * 1000) continue;

                        // Skip very short events (< 5 min)
                        if (durationMs < 5 * 60 * 1000) continue;

                        const meetingLink = location ? this.extractMeetingLink(location) : undefined;

                        events.push({
                            id: `sys-${title}-${startTime}`,
                            title: title.trim() || '(Sans titre)',
                            startTime,
                            endTime,
                            link: meetingLink,
                            source: 'google' // reuse type — calName could be added if CalendarEvent is extended
                        });
                    } catch {}
                }

                // Sort by start time
                events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
                console.log(`[CalendarManager] System calendar returned ${events.length} events`);
                resolve(events);
            });
        });
    }

    private parseAppleScriptDate(dateStr: string): string | null {
        // AppleScript date format: "Wednesday, April 15, 2026 at 12:00:00 PM"
        // or locale variant. We parse it as a JS date.
        try {
            const d = new Date(dateStr
                .replace(' at ', ' ')          // remove "at"
                .replace(/(\d)(AM|PM)/i, '$1 $2') // ensure space before AM/PM
            );
            if (isNaN(d.getTime())) return null;
            return d.toISOString();
        } catch {
            return null;
        }
    }
}
