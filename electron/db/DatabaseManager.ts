
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

export interface ActionItem {
    text: string;
    goal_id?: string | null;
    goal_confidence?: number | null;
    speaker?: string;
    timestamp?: number;
    completed_at?: number | null;
}

/**
 * Normalize a raw action item entry (string or ActionItem object) to ActionItem.
 */
export function normalizeActionItem(item: string | ActionItem): ActionItem {
    if (typeof item === 'string') {
        return { text: item, goal_id: null, goal_confidence: null };
    }
    return item;
}

// Interfaces for our data objects
export interface Meeting {
    id: string;
    title: string;
    date: string; // ISO string
    duration: string;
    summary: string;
    detailedSummary?: {
        overview?: string;
        actionItems: ActionItem[];
        keyPoints: string[];
    };
    transcript?: Array<{
        speaker: string;
        text: string;
        timestamp: number;
    }>;
    usage?: Array<{
        type: 'assist' | 'followup' | 'chat' | 'followup_questions';
        timestamp: number;
        question?: string;
        answer?: string;
        items?: string[];
    }>;
    calendarEventId?: string;
    source?: 'manual' | 'calendar';
    isProcessed?: boolean;
    screenshots?: Array<{ path: string; timestamp: number; label?: string }>;
}

export class DatabaseManager {
    private static instance: DatabaseManager;
    private db: Database.Database | null = null;
    private dbPath: string;

    private constructor() {
        const userDataPath = app.getPath('userData');
        this.dbPath = path.join(userDataPath, 'natively.db');
        this.init();
    }

    public static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    private init() {
        try {
            console.log(`[DatabaseManager] Initializing database at ${this.dbPath}`);
            // Ensure directory exists (though userData usually does)
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`[DatabaseManager] Created directory: ${dir}`);
            } else {
                console.log(`[DatabaseManager] Directory exists: ${dir}`);
                try {
                    const files = fs.readdirSync(dir);
                    console.log(`[DatabaseManager] Directory contents:`, files);
                    const dbExists = fs.existsSync(this.dbPath);
                    if (dbExists) {
                        const stats = fs.statSync(this.dbPath);
                        console.log(`[DatabaseManager] Found existing DB. Size: ${stats.size} bytes`);
                    } else {
                        console.log(`[DatabaseManager] No existing DB found at ${this.dbPath}. Creating new one.`);
                    }
                } catch (e) {
                    console.error('[DatabaseManager] Error checking directory/file:', e);
                }
            }

            this.db = new Database(this.dbPath);
            this.runMigrations();
        } catch (error) {
            console.error('[DatabaseManager] Failed to initialize database:', error);
            throw error;
        }
    }

    private runMigrations() {
        if (!this.db) return;

        const createMeetingsTable = `
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT,
                start_time INTEGER,
                duration_ms INTEGER,
                summary_json TEXT, -- JSON containing actionItems, keyPoints, and legacy summary text if needed
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                calendar_event_id TEXT,
                source TEXT
            );
        `;

        const createTranscriptsTable = `
            CREATE TABLE IF NOT EXISTS transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT,
                speaker TEXT,
                content TEXT,
                timestamp_ms INTEGER,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        `;

        const createAiInteractionsTable = `
            CREATE TABLE IF NOT EXISTS ai_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT,
                type TEXT,
                timestamp INTEGER,
                user_query TEXT,
                ai_response TEXT,
                metadata_json TEXT, -- JSON for lists or extra data
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        `;

        this.db.exec(createMeetingsTable);
        this.db.exec(createTranscriptsTable);
        this.db.exec(createAiInteractionsTable);

        // Migration: add screenshots_json column if not present
        const existingCols = (this.db.prepare("PRAGMA table_info(meetings)").all() as any[]).map((c: any) => c.name);
        if (!existingCols.includes('screenshots_json')) {
            this.db.prepare("ALTER TABLE meetings ADD COLUMN screenshots_json TEXT DEFAULT '[]'").run();
        }

        // RAG: Semantic chunks with embeddings
        const createChunksTable = `
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                speaker TEXT,
                start_timestamp_ms INTEGER,
                end_timestamp_ms INTEGER,
                cleaned_text TEXT NOT NULL,
                token_count INTEGER NOT NULL,
                embedding BLOB,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        `;
        this.db.exec(createChunksTable);

        // RAG: Meeting-level summaries for global search
        const createChunkSummariesTable = `
            CREATE TABLE IF NOT EXISTS chunk_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL UNIQUE,
                summary_text TEXT NOT NULL,
                embedding BLOB,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        `;
        this.db.exec(createChunkSummariesTable);

        // RAG: Embedding queue for retry/failure handling
        const createEmbeddingQueueTable = `
            CREATE TABLE IF NOT EXISTS embedding_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                chunk_id INTEGER,
                status TEXT DEFAULT 'pending',
                retry_count INTEGER DEFAULT 0,
                error_message TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                processed_at TEXT
            );
        `;
        this.db.exec(createEmbeddingQueueTable);

        // Create index for chunks lookup
        try {
            this.db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_meeting ON chunks(meeting_id)");
        } catch (e) { /* Index may exist */ }

        // Migration for existing tables
        try {
            this.db.exec("ALTER TABLE meetings ADD COLUMN calendar_event_id TEXT");
        } catch (e) { /* Column likely exists */ }

        try {
            this.db.exec("ALTER TABLE meetings ADD COLUMN source TEXT");
        } catch (e) { /* Column likely exists */ }

        try {
            this.db.exec("ALTER TABLE meetings ADD COLUMN is_processed INTEGER DEFAULT 1"); // Default to 1 (true) for existing records
        } catch (e) { /* Column likely exists */ }

        // Data migration: convert actionItems from string[] to ActionItem[]
        this.migrateActionItemsFormat();

        console.log('[DatabaseManager] Migrations completed.');
    }

    /**
     * One-time data migration: convert actionItems from string[] to ActionItem[].
     * Idempotent — skips rows already in ActionItem format.
     */
    private migrateActionItemsFormat(): void {
        if (!this.db) return;
        const rows = this.db.prepare('SELECT id, summary_json FROM meetings WHERE summary_json IS NOT NULL').all() as { id: string; summary_json: string }[];
        const update = this.db.prepare('UPDATE meetings SET summary_json = ? WHERE id = ?');

        this.db.transaction(() => {
            for (const row of rows) {
                try {
                    const data = JSON.parse(row.summary_json);
                    const items = data?.detailedSummary?.actionItems;
                    if (!Array.isArray(items) || items.length === 0) continue;
                    // Check if already migrated (first item is an object with 'text')
                    if (typeof items[0] === 'object' && items[0] !== null && 'text' in items[0]) continue;
                    // Convert string[] → ActionItem[]
                    data.detailedSummary.actionItems = items.map((item: string | ActionItem) => normalizeActionItem(item));
                    update.run(JSON.stringify(data), row.id);
                } catch {
                    // Skip malformed rows
                }
            }
        })();
    }

    // ============================================
    // Public API
    // ============================================

    public saveMeeting(meeting: Meeting, startTimeMs: number, durationMs: number) {
        if (!this.db) {
            console.error('[DatabaseManager] DB not initialized');
            return;
        }

        const insertMeeting = this.db.prepare(`
            INSERT OR REPLACE INTO meetings (id, title, start_time, duration_ms, summary_json, created_at, calendar_event_id, source, is_processed, screenshots_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertTranscript = this.db.prepare(`
            INSERT INTO transcripts (meeting_id, speaker, content, timestamp_ms)
            VALUES (?, ?, ?, ?)
        `);

        const insertInteraction = this.db.prepare(`
            INSERT INTO ai_interactions (meeting_id, type, timestamp, user_query, ai_response, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const summaryJson = JSON.stringify({
            legacySummary: meeting.summary,
            detailedSummary: meeting.detailedSummary
        });

        const runTransaction = this.db.transaction(() => {
            // 1. Insert Meeting
            insertMeeting.run(
                meeting.id,
                meeting.title,
                startTimeMs,
                durationMs,
                summaryJson,
                meeting.date, // Using the ISO string as created_at for sorting simply
                meeting.calendarEventId || null,
                meeting.source || 'manual',
                meeting.isProcessed ? 1 : 0,
                JSON.stringify(meeting.screenshots || [])
            );

            // 2. Insert Transcript
            if (meeting.transcript) {
                for (const segment of meeting.transcript) {
                    insertTranscript.run(
                        meeting.id,
                        segment.speaker,
                        segment.text,
                        segment.timestamp
                    );
                }
            }

            // 3. Insert Interactions
            if (meeting.usage) {
                for (const usage of meeting.usage) {
                    let metadata = null;
                    if (usage.items) {
                        metadata = JSON.stringify(usage.items);
                    } else if (usage.type === 'followup_questions' && usage.answer) {
                        // Sometimes answer is the array for questions, or we store it in metadata
                        // In intelligence manager we pushed: { type: 'followup_questions', answer: fullQuestions }
                        // Let's store that 'answer' (array) in metadata for this type
                        if (Array.isArray(usage.answer)) {
                            metadata = JSON.stringify(usage.answer);
                        }
                    }

                    // Normalization
                    const answerText = Array.isArray(usage.answer) ? null : usage.answer || null;
                    const queryText = usage.question || null;

                    insertInteraction.run(
                        meeting.id,
                        usage.type,
                        usage.timestamp,
                        queryText,
                        answerText,
                        metadata
                    );
                }
            }
        });

        try {
            runTransaction();
            console.log(`[DatabaseManager] Successfully saved meeting ${meeting.id}`);
        } catch (err) {
            console.error(`[DatabaseManager] Failed to save meeting ${meeting.id}`, err);
            throw err;
        }
    }

    public updateMeetingTitle(id: string, title: string): boolean {
        if (!this.db) return false;
        try {
            const stmt = this.db.prepare('UPDATE meetings SET title = ? WHERE id = ?');
            const info = stmt.run(title, id);
            return info.changes > 0;
        } catch (error) {
            console.error(`[DatabaseManager] Failed to update title for meeting ${id}:`, error);
            return false;
        }
    }

    public updateMeetingSummary(id: string, updates: { overview?: string, actionItems?: (string | ActionItem)[], keyPoints?: string[], actionItemsTitle?: string, keyPointsTitle?: string }): boolean {
        if (!this.db) return false;

        try {
            // 1. Get current summary_json
            const row = this.db.prepare('SELECT summary_json FROM meetings WHERE id = ?').get(id) as any;
            if (!row) return false;

            const existingData = JSON.parse(row.summary_json || '{}');
            const currentDetailed = existingData.detailedSummary || {};

            // 2. Merge updates
            const newDetailed = {
                ...currentDetailed,
                ...updates
            };

            // Should likely filter out undefined updates if spread doesn't handle them how we want, 
            // but spread over undefined is fine. We want to overwrite if provided.
            // If updates.overview is empty string, it overwrites. 
            // If updates.overview is undefined, we use ...updates trick:
            // Actually spread only includes own enumerable properties. If I pass { overview: "new" }, it works.

            // However, we need to be careful not to wipe legacySummary if it exists
            const newData = {
                ...existingData,
                detailedSummary: newDetailed
            };

            const jsonStr = JSON.stringify(newData);

            // 3. Write back
            const stmt = this.db.prepare('UPDATE meetings SET summary_json = ? WHERE id = ?');
            const info = stmt.run(jsonStr, id);
            return info.changes > 0;

        } catch (error) {
            console.error(`[DatabaseManager] Failed to update summary for meeting ${id}:`, error);
            return false;
        }
    }

    public getRecentMeetings(limit: number = 50): Meeting[] {
        if (!this.db) return [];

        const stmt = this.db.prepare(`
            SELECT * FROM meetings 
            ORDER BY created_at DESC 
            LIMIT ?
        `);

        const rows = stmt.all(limit) as any[];

        return rows.map(row => {
            const summaryData = JSON.parse(row.summary_json || '{}');

            // Format duration string if needed, but we typically store ms
            // Let's recreate the 'duration' string "MM:SS" from duration_ms
            const minutes = Math.floor(row.duration_ms / 60000);
            const seconds = Math.floor((row.duration_ms % 60000) / 1000);
            const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            return {
                id: row.id,
                title: row.title,
                date: row.created_at, // Use the stored ISO string
                duration: durationStr,
                summary: summaryData.legacySummary || '',
                detailedSummary: summaryData.detailedSummary,
                calendarEventId: row.calendar_event_id,
                source: row.source as any,
                // We don't load full transcript/usage for list view to keep it light
                transcript: [] as any[],
                usage: [] as any[]
            };
        });
    }

    public getMeetingDetails(id: string): Meeting | null {
        if (!this.db) return null;

        const meetingStmt = this.db.prepare('SELECT * FROM meetings WHERE id = ?');
        const meetingRow = meetingStmt.get(id) as any;

        if (!meetingRow) return null;

        // Get Transcript
        const transcriptStmt = this.db.prepare('SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY timestamp_ms ASC');
        const transcriptRows = transcriptStmt.all(id) as any[];

        // Get Usage
        const usageStmt = this.db.prepare('SELECT * FROM ai_interactions WHERE meeting_id = ? ORDER BY timestamp ASC');
        const usageRows = usageStmt.all(id) as any[];

        // Reconstruct
        const summaryData = JSON.parse(meetingRow.summary_json || '{}');
        const minutes = Math.floor(meetingRow.duration_ms / 60000);
        const seconds = Math.floor((meetingRow.duration_ms % 60000) / 1000);
        const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        const transcript = transcriptRows.map(row => ({
            speaker: row.speaker,
            text: row.content,
            timestamp: row.timestamp_ms
        }));

        const usage = usageRows.map(row => {
            let items: string[] | undefined;
            let answer = row.ai_response;

            if (row.metadata_json) {
                try {
                    const parsed = JSON.parse(row.metadata_json);
                    if (Array.isArray(parsed)) {
                        items = parsed;
                        // Special case: for 'followup_questions', earlier we treated 'answer' as the array in memory
                        // UI expects appropriate field. If type is 'followup_questions', usually answer is null and items has the questions.
                    }
                } catch (e) { }
            }

            return {
                type: row.type,
                timestamp: row.timestamp,
                question: row.user_query,
                answer: answer,
                items: items
            };
        });

        return {
            id: meetingRow.id,
            title: meetingRow.title,
            date: meetingRow.created_at,
            duration: durationStr,
            summary: summaryData.legacySummary || '',
            detailedSummary: summaryData.detailedSummary,
            calendarEventId: meetingRow.calendar_event_id,
            source: meetingRow.source,
            transcript: transcript,
            usage: usage,
            screenshots: JSON.parse(meetingRow.screenshots_json || '[]')
        };
    }

    public deleteMeeting(id: string): boolean {
        if (!this.db) return false;

        try {
            const stmt = this.db.prepare('DELETE FROM meetings WHERE id = ?');
            const info = stmt.run(id);
            console.log(`[DatabaseManager] Deleted meeting ${id}. Changes: ${info.changes}`);
            return info.changes > 0;
        } catch (error) {
            console.error(`[DatabaseManager] Failed to delete meeting ${id}:`, error);
            return false;
        }
    }

    public getUnprocessedMeetings(): Meeting[] {
        if (!this.db) return [];

        // is_processed = 0 means false
        const stmt = this.db.prepare(`
            SELECT * FROM meetings 
            WHERE is_processed = 0 
            ORDER BY created_at DESC
        `);

        const rows = stmt.all() as any[];

        return rows.map(row => {
            // Reconstruct minimal meeting object for processing
            // We mainly need ID to fetch transcripts later
            const summaryData = JSON.parse(row.summary_json || '{}');
            const minutes = Math.floor(row.duration_ms / 60000);
            const seconds = Math.floor((row.duration_ms % 60000) / 1000);
            const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            return {
                id: row.id,
                title: row.title,
                date: row.created_at,
                duration: durationStr,
                summary: summaryData.legacySummary || '',
                detailedSummary: summaryData.detailedSummary,
                calendarEventId: row.calendar_event_id,
                source: row.source,
                isProcessed: false,
                transcript: [] as any[], // Fetched separately via getMeetingDetails or manually if needed
                usage: [] as any[]
            };
        });
    }

    /**
     * Get open (uncompleted) action items tagged with a specific goal.
     */
    public getOpenActionItemsByGoal(goalId: string): { text: string; meeting_id: string; goal_id: string; meeting_date: string }[] {
        if (!this.db) return [];
        const rows = this.db.prepare(
            'SELECT id, summary_json, created_at FROM meetings ORDER BY created_at DESC'
        ).all() as { id: string; summary_json: string; created_at: string }[];

        const results: { text: string; meeting_id: string; goal_id: string; meeting_date: string }[] = [];
        for (const row of rows) {
            try {
                const data = JSON.parse(row.summary_json || '{}');
                const items: ActionItem[] = data?.detailedSummary?.actionItems || [];
                for (const item of items) {
                    if (typeof item === 'object' && item.goal_id === goalId && !item.completed_at) {
                        results.push({
                            text: item.text,
                            meeting_id: row.id,
                            goal_id: goalId,
                            meeting_date: row.created_at,
                        });
                    }
                }
            } catch {
                // Skip malformed rows
            }
        }
        return results;
    }

    public clearAllData(): boolean {
        if (!this.db) return false;

        try {
            // Clear all tables (order matters due to foreign keys, but SQLite handles with ON DELETE CASCADE)
            this.db.exec('DELETE FROM embedding_queue');
            this.db.exec('DELETE FROM chunk_summaries');
            this.db.exec('DELETE FROM chunks');
            this.db.exec('DELETE FROM ai_interactions');
            this.db.exec('DELETE FROM transcripts');
            this.db.exec('DELETE FROM meetings');

            console.log('[DatabaseManager] All data cleared from database.');
            return true;
        } catch (error) {
            console.error('[DatabaseManager] Failed to clear all data:', error);
            return false;
        }
    }

    public seedDemoMeeting() {
        if (!this.db) return;

        // Check if demo meeting already exists
        const existing = this.db.prepare('SELECT id FROM meetings WHERE id = ?').get('demo-meeting');
        if (existing) {
            console.log('[DatabaseManager] Demo meeting already exists, skipping seed.');
            return;
        }

        // Do NOT flush all meetings. Preserving user data is critical.
        // If we really need to clean up old demo data, we should delete only that ID.
        // this.deleteMeeting('demo-meeting'); // Optional safety if we wanted to force update

        const demoId = 'demo-meeting';

        // Set date to today 9:30 AM
        const today = new Date();
        today.setHours(9, 30, 0, 0);

        const durationMs = 300000; // 5 min

        const summaryMarkdown = `# Vue d’ensemble

Cluely.fr est un assistant IA de réunion en temps réel conçu pour vous aider à rester concentré, informé et réactif pendant vos appels. Obtenez des informations en direct pendant que vous parlez, des réponses instantanées à vos questions, et des notes structurées après chaque réunion.

# Démarrage

### Démarrer une session
Cliquez sur **Démarrer une session** depuis le tableau de bord.
Rejoignez une réunion planifiée et démarrez directement depuis la notification de réunion.

### Pendant une réunion
- Utilisez les **cinq boutons d’action rapide** pour une assistance en temps réel
- Afficher ou masquer Cluely.fr à tout moment :
  - **Mac** : Cmd + B
  - **Windows** : Ctrl + B
- Déplacez le widget n’importe où sur votre écran en survolant la pilule supérieure et en faisant glisser

# Fonctionnalités principales

## Cinq boutons d’action rapide
- **Quoi répondre** : Génère instantanément une réponse contextuelle au sujet en cours.
- **Raccourcir** : Affine la dernière réponse suggérée pour la rendre plus concise et naturelle.
- **Récap** : Génère un résumé complet de la conversation jusqu’à présent.
- **Question de suivi** : Suggère des questions stratégiques que vous pouvez poser pour faire avancer la conversation.
- **Répondre** : Déclenchez manuellement une réponse ou utilisez la saisie vocale pour poser des questions spécifiques.

## Insights de réunion (Launcher)
- **Prise de notes intelligente** : Capture automatiquement les points clés, les actions à réaliser et les résumés structurés.
- **Résumé** : Un bref résumé de haut niveau de l’intégralité de la réunion.
- **Transcript** : Transcription vocale complète en temps réel, disponible pendant et après l’appel.
- **Utilisation** : Suivez votre historique d’interaction et voyez comment Cluely.fr vous a assisté.

## Insights en direct
Cliquez sur **Insights en direct** pendant un appel pour voir :
- Questions et invites en temps réel
- Mots-clés et sujets détectés
- Suggestions contextuelles basées sur la conversation
- Cliquez sur n’importe quel insight pour obtenir une réponse instantanée.

## Chat IA
- Tapez votre question et appuyez sur **Entrée** ou cliquez sur **Envoyer**
- Activez le **Mode avancé** pour l’assistance au raisonnement et au codage

## Captures d’écran
- **Capture plein écran** : Cmd + H
- **Capture sélective** : Cmd + Maj + H

# Tirer le meilleur parti de Cluely.fr

### Contexte personnalisé
Téléchargez des CV, des briefs de projet, des scripts de vente ou d’autres documents pour adapter les réponses à votre flux de travail (bientôt disponible).

### Préférences de langue
Allez dans **Paramètres → Préférences de langue** pour :
- Changer la langue d’entrée et de sortie
- Activer la traduction en temps réel pendant les appels

### Indétectabilité
Activez le module **Indétectabilité** pour garder Cluely.fr invisible lors du partage d’écran.

# Interface de base

- **Tableau de bord** : Démarrez des réunions et consultez l’activité récente
- **Démarrer une session** : Commencez une nouvelle réunion instantanément
- **Paramètres** : Configurez les clés API, la langue et la visibilité
- **Historique** : Consultez les réunions passées, les notes et les transcripts

# Configuration de l’API

1. Ouvrez **Paramètres**
2. Faites défiler jusqu’à **Identifiants**
3. Ajoutez vos clés API :
   - **Gemini**
   - **Groq**
4. Pour activer la transcription en temps réel, sélectionnez l’emplacement de votre **fichier JSON de compte de service Google Cloud**.

Si vous n’en avez pas encore, suivez les étapes ci-dessous pour en créer un.

# Création d’un compte de service Google Speech-to-Text

## 1. Créer ou sélectionner un projet
- Ouvrez **Google Cloud Console**
- Créez un nouveau projet ou sélectionnez-en un existant
- Assurez-vous que la facturation est activée

## 2. Activer l’API Speech-to-Text
- Allez dans **APIs & Services → Bibliothèque**
- Activez **Speech-to-Text API**

## 3. Créer un compte de service
- Naviguez vers **IAM & Admin → Comptes de service**
- Cliquez sur **Créer un compte de service**
- **Nom** : cluely-fr-stt
- **Description** : optionnel

## 4. Attribuer les permissions
- Accordez le rôle suivant : **Speech-to-Text User** (\`roles/speech.client\`)

## 5. Créer une clé JSON
- Ouvrez le compte de service
- Allez dans **Clés → Ajouter une clé → Créer une nouvelle clé**
- Sélectionnez **JSON**
- Téléchargez le fichier

**Une fois téléchargé, retournez dans Paramètres → Identifiants dans Cluely.fr et sélectionnez ce fichier pour terminer la configuration.**

# Crédit Google Cloud gratuit (nouveaux utilisateurs)

Les nouveaux comptes Google Cloud reçoivent **300 $ de crédits gratuits**, valables 90 jours.

Pour activer :
1. Visitez [cloud.google.com](https://cloud.google.com)
2. Cliquez sur **Commencer gratuitement**
3. Connectez-vous avec un compte Google
4. Ajoutez les informations de facturation (carte requise)
5. Activez l’essai gratuit

Le crédit peut être utilisé pour Speech-to-Text et est suffisant pour des tests étendus et une utilisation régulière.

# Support

Si vous avez besoin d’aide pour la configuration ou l’utilisation, contactez-nous à tout moment à :
guillaume@autoflux.fr`;

        const demoMeeting: Meeting = {
            id: demoId,
            title: "Guide de démarrage Cluely.fr",
            date: today.toISOString(),
            duration: "5:00",
            summary: "Guide complet pour utiliser Cluely.fr, votre assistant IA de réunion en temps réel.",
            detailedSummary: {
                overview: summaryMarkdown,
                actionItems: [],
                keyPoints: []
            },
            transcript: [
                { speaker: 'interviewer', text: "Bienvenue sur Cluely.fr ! Laissez-moi vous montrer comment ça fonctionne.", timestamp: 0 },
                { speaker: 'user', text: "Merci ! J'ai hâte d'essayer.", timestamp: 5000 },
                { speaker: 'interviewer', text: "Vous avez 5 boutons d'action rapide. 'Quoi répondre' écoute la conversation et suggère ce que vous devriez dire.", timestamp: 10000 },
                { speaker: 'user', text: "Ça semble très utile pour les entretiens.", timestamp: 18000 },
                { speaker: 'interviewer', text: "Consultez la section 'Guide d'utilisation' dans les notes pour les instructions de configuration API.", timestamp: 20000 },
                { speaker: 'interviewer', text: "'Raccourcir' condense la dernière réponse. 'Récap' résume toute la conversation jusqu'à présent.", timestamp: 22000 },
                { speaker: 'user', text: "Et les autres boutons ?", timestamp: 30000 },
                { speaker: 'interviewer', text: "'Questions de suivi' suggère des questions que vous pouvez poser. 'Répondre' vous permet de parler une question et d'obtenir une réponse instantanée.", timestamp: 35000 },
                { speaker: 'user', text: "Puis-je prendre des captures d'écran pendant les appels ?", timestamp: 45000 },
                { speaker: 'interviewer', text: "Oui ! Appuyez sur Cmd+H pour plein écran ou Cmd+Maj+H pour sélectionner une zone. L'IA l'analysera et vous aidera.", timestamp: 50000 },
                { speaker: 'user', text: "Comment masquer Cluely.fr lors du partage d'écran ?", timestamp: 60000 },
                { speaker: 'interviewer', text: "Appuyez sur Cmd+B pour basculer la visibilité à tout moment. Vous pouvez aussi activer le mode indétectable dans les paramètres.", timestamp: 65000 },
                { speaker: 'user', text: "C'est incroyable. Que se passe-t-il après l'appel ?", timestamp: 75000 },
                { speaker: 'interviewer', text: "Vous obtenez des notes de réunion détaillées avec les actions à réaliser, les points clés, le transcript complet et un journal de toutes les interactions IA.", timestamp: 80000 }
            ],
            usage: [
                { type: 'assist', timestamp: 15000, question: 'Quelles fonctionnalités propose Cluely.fr ?', answer: 'Cluely.fr propose 5 boutons d\'action rapide, l\'analyse de captures d\'écran, la transcription en temps réel et des notes de réunion complètes.' },
                { type: 'followup', timestamp: 40000, question: 'Comment fonctionnent les boutons d\'action ?', answer: 'Chaque bouton a un objectif précis : suggérer des réponses, raccourcir les réponses, récapituler les conversations, générer des questions de suivi, ou obtenir des réponses voix-en-texte instantanées.' }
            ],
            isProcessed: true
        };

        this.saveMeeting(demoMeeting, today.getTime(), durationMs);
        console.log('[DatabaseManager] Seeded demo meeting.');
    }
}
