import { execFile } from 'child_process';
import { EventEmitter } from 'events';

export interface EmailMessage {
    subject: string;
    sender: string;
    date: string; // ISO
    snippet: string;
    mailbox: string;
}

export class EmailManager extends EventEmitter {
    private static instance: EmailManager;
    private cache: Map<string, { messages: EmailMessage[]; expiry: number }> = new Map();
    private static CACHE_TTL_MS = 5 * 60_000;
    private static PER_SENDER_LIMIT = 5;

    private constructor() {
        super();
    }

    public static getInstance(): EmailManager {
        if (!EmailManager.instance) {
            EmailManager.instance = new EmailManager();
        }
        return EmailManager.instance;
    }

    public isAvailable(): boolean {
        return process.platform === 'darwin';
    }

    public async getMessagesFromSender(senderEmail: string): Promise<EmailMessage[]> {
        if (!this.isAvailable()) return [];
        const normalized = senderEmail.trim().toLowerCase();
        if (!normalized || !normalized.includes('@')) return [];

        const cached = this.cache.get(normalized);
        if (cached && cached.expiry > Date.now()) {
            return cached.messages;
        }

        const messages = await this.queryMail(normalized);
        this.cache.set(normalized, {
            messages,
            expiry: Date.now() + EmailManager.CACHE_TTL_MS,
        });
        return messages;
    }

    public async getMessagesFromSenders(senderEmails: string[]): Promise<Map<string, EmailMessage[]>> {
        const result = new Map<string, EmailMessage[]>();
        const unique = [...new Set(senderEmails.map(e => e.trim().toLowerCase()).filter(e => e.includes('@')))];
        await Promise.all(
            unique.map(async (email) => {
                const msgs = await this.getMessagesFromSender(email);
                if (msgs.length > 0) result.set(email, msgs);
            })
        );
        return result;
    }

    private queryMail(senderEmail: string): Promise<EmailMessage[]> {
        const safeEmail = senderEmail.replace(/["\\]/g, '');
        const script = `
set output to ""
set targetEmail to "${safeEmail}"
set maxMessages to ${EmailManager.PER_SENDER_LIMIT}
tell application "Mail"
  try
    set allAccounts to every account
    set collected to {}
    repeat with acc in allAccounts
      try
        set inboxMb to mailbox "INBOX" of acc
        set matchingMsgs to (messages of inboxMb whose sender contains targetEmail)
        repeat with m in matchingMsgs
          set end of collected to m
          if (count of collected) is greater than or equal to (maxMessages * 3) then exit repeat
        end repeat
      end try
      if (count of collected) is greater than or equal to (maxMessages * 3) then exit repeat
    end repeat
    set sortedByDate to collected
    set finalCount to 0
    repeat with m in sortedByDate
      if finalCount is greater than or equal to maxMessages then exit repeat
      try
        set mSubj to subject of m
        set mSender to sender of m
        set mDate to (date received of m) as string
        set mMailbox to name of (mailbox of m)
        set mContent to ""
        try
          set mContent to content of m
        end try
        if mContent is missing value then set mContent to ""
        if length of mContent > 500 then
          set mContent to text 1 thru 500 of mContent
        end if
        set output to output & mSubj & "|||" & mSender & "|||" & mDate & "|||" & mMailbox & "|||" & mContent & "<<<END>>>"
        set finalCount to finalCount + 1
      end try
    end repeat
  on error errMsg
    return "ERROR: " & errMsg
  end try
end tell
return output
        `.trim();

        return new Promise((resolve) => {
            execFile('osascript', ['-e', script], { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
                if (err) {
                    console.error('[EmailManager] osascript failed:', err.message);
                    resolve([]);
                    return;
                }
                const raw = stdout.trim();
                if (raw.startsWith('ERROR:')) {
                    console.warn('[EmailManager]', raw);
                    resolve([]);
                    return;
                }
                const messages: EmailMessage[] = [];
                const entries = raw.split('<<<END>>>').filter(e => e.includes('|||'));
                for (const entry of entries) {
                    const parts = entry.split('|||');
                    if (parts.length < 5) continue;
                    const [subject, sender, dateStr, mailbox, snippet] = parts;
                    const isoDate = this.parseAppleScriptDate(dateStr.trim()) || new Date().toISOString();
                    messages.push({
                        subject: subject.trim(),
                        sender: sender.trim(),
                        date: isoDate,
                        mailbox: mailbox.trim(),
                        snippet: snippet.trim().replace(/\s+/g, ' ').slice(0, 400),
                    });
                }
                messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                resolve(messages.slice(0, EmailManager.PER_SENDER_LIMIT));
            });
        });
    }

    private parseAppleScriptDate(dateStr: string): string | null {
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            return d.toISOString();
        } catch {
            return null;
        }
    }

    public clearCache(): void {
        this.cache.clear();
    }
}
