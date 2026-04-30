import { EventEmitter } from 'events';
import { CalendarManager, CalendarEvent } from './CalendarManager';
import { ZoomWatcher } from './ZoomWatcher';
import { projectResolver } from './ProjectResolver';
import { templateClassifier } from './TemplateClassifier';
import { AttendeeProfiler, AttendeeProfile } from './AttendeeProfiler';
import { preBriefComposer, PreBrief } from './PreBriefComposer';
import { EmailManager } from './EmailManager';
import { healthSnapshotFetcher } from './HealthSnapshotFetcher';
import { serializeSnapshot, serializeError } from './HealthSnapshotSerializer';
import { HealthChunkWriter } from './HealthChunkWriter';

const LEAD_TIME_MS = 5 * 60_000;   // 5 min before event
const WINDOW_MS = 60_000;           // ± 1 min window
const POLL_INTERVAL_MS = 60_000;

export class PreMeetingOrchestrator extends EventEmitter {
  private static instance: PreMeetingOrchestrator;
  private firedEventIds = new Map<string, number>();
  private pollTimer: NodeJS.Timeout | null = null;
  private profiler: AttendeeProfiler;
  private lastBrief: PreBrief | null = null;
  private healthChunkWriter: HealthChunkWriter | null = null;

  private constructor(
    private calendarManager: CalendarManager,
    private zoomWatcher: ZoomWatcher,
  ) {
    super();
    this.profiler = new AttendeeProfiler(EmailManager.getInstance());
  }

  setHealthChunkWriter(writer: HealthChunkWriter): void {
    this.healthChunkWriter = writer;
  }

  static getInstance(cal = CalendarManager.getInstance(), zoom = ZoomWatcher.getInstance()): PreMeetingOrchestrator {
    if (!PreMeetingOrchestrator.instance) {
      PreMeetingOrchestrator.instance = new PreMeetingOrchestrator(cal, zoom);
    }
    return PreMeetingOrchestrator.instance;
  }

  /** Reset singleton (for testing) */
  static resetInstance(): void {
    if (PreMeetingOrchestrator.instance) {
      PreMeetingOrchestrator.instance.stop();
    }
    PreMeetingOrchestrator.instance = undefined as any;
  }

  start() {
    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
    this.tick(); // immediate first run
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getLastBrief(): PreBrief | null {
    return this.lastBrief;
  }

  async tick() {
    if (this.zoomWatcher.isZoomRunning()) return;
    const events = await this.calendarManager.fetchUpcomingEvents().catch((err) => {
      console.warn('[PreMeetingOrchestrator] Failed to fetch upcoming events:', err);
      return [] as CalendarEvent[];
    });
    const now = Date.now();

    // Prune entries older than 24h
    for (const [id, ts] of this.firedEventIds) {
      if (now - ts > 24 * 60 * 60 * 1000) this.firedEventIds.delete(id);
    }

    for (const event of events) {
      const msUntil = new Date(event.startTime).getTime() - now;
      if (msUntil < LEAD_TIME_MS - WINDOW_MS || msUntil > LEAD_TIME_MS + WINDOW_MS) continue;
      if (this.firedEventIds.has(event.id)) continue;
      this.firedEventIds.set(event.id, now);
      this.fire(event).catch(err => console.error('[PreMeetingOrchestrator] fire error', err));
    }
  }

  private async fire(event: CalendarEvent) {
    const { projectId } = projectResolver.resolve(event);
    const templateId = templateClassifier.classify(event.title, event.attendees?.length ?? 0);
    let attendees: AttendeeProfile[] = [];
    try {
      attendees = await this.profiler.profile(event.attendees ?? []);
    } catch (err) {
      console.warn('[PreMeetingOrchestrator] Attendee profiling failed, proceeding with empty profiles:', err);
    }
    // Health injection: fetch project health and write to KB (never blocks pipeline)
    if (projectId && this.healthChunkWriter) {
      try {
        const snapshot = await healthSnapshotFetcher.fetchForProject(projectId);
        if (snapshot) {
          const markdown = serializeSnapshot(snapshot);
          this.healthChunkWriter.writeChunk(markdown, {
            projectId,
            chunkType: 'health-snapshot',
            fetchedAt: snapshot.fetchedAt,
          });
        } else {
          const errorMd = serializeError(projectId, 'Endpoint unreachable or not configured');
          this.healthChunkWriter.writeChunk(errorMd, {
            projectId,
            chunkType: 'health-snapshot',
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn('[PreMeetingOrchestrator] Health injection failed, continuing:', err);
      }
    }

    const brief = preBriefComposer.compose(event, projectId, templateId, attendees);
    this.lastBrief = brief;
    this.emit('pre-meeting:brief-ready', brief);
  }
}
