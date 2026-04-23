> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Implement the Zero-Touch Pre-Meeting Context Loader — a single orchestrated pipeline that fires 5 minutes before each calendar event, resolves the project, selects an extraction template, assembles an attendee brief, and pushes it to the Launcher banner with no user interaction.

**Architecture:** `PreMeetingOrchestrator` singleton in main process; 60-second poll loop over `CalendarManager`; sequential pipeline: `ProjectResolver` → `TemplateClassifier` → `AttendeeProfiler` → `PreBriefComposer`; IPC push to renderer; `PreBriefBanner` React component in Launcher.

**Tech Stack:** TypeScript/Electron (main process), React (renderer), better-sqlite3 (memory graph queries when available), existing `CalendarManager` + `EmailManager` services, Vitest for unit tests.

---

### Task 1: TemplateClassifier

**Files:**
- Create `electron/services/TemplateClassifier.ts`
- Create `electron/services/__tests__/TemplateClassifier.test.ts`

- [ ] Step 1: Write failing test — fixture table of event titles mapped to expected template IDs: `"daily standup" → standup`, `"1:1 with alice" → one-on-one`, `"sales call - acme" → sales`, `"project kickoff" → kickoff`, `"unknown foo" → default`
- [ ] Step 2: Run `npx vitest run electron/services/__tests__/TemplateClassifier.test.ts` — confirm test fails (module not found)
- [ ] Step 3: Implement `TemplateClassifier.ts`:

```typescript
export type TemplateId = 'standup' | 'one-on-one' | 'sales' | 'kickoff' | 'review' | 'default';

const KEYWORD_MAP: Array<{ keywords: string[]; template: TemplateId }> = [
  { keywords: ['standup', 'stand-up', 'stand up', 'daily'], template: 'standup' },
  { keywords: ['1:1', '1-1', 'one on one', 'one-on-one', 'catch up', 'catch-up'], template: 'one-on-one' },
  { keywords: ['sales', 'demo', 'bant', 'prospect', 'pitch'], template: 'sales' },
  { keywords: ['kickoff', 'kick-off', 'kick off', 'onboarding'], template: 'kickoff' },
  { keywords: ['review', 'retro', 'retrospective', 'post-mortem', 'postmortem'], template: 'review' },
];

export class TemplateClassifier {
  classify(eventTitle: string, attendeeCount: number): TemplateId {
    const lower = eventTitle.toLowerCase();
    for (const { keywords, template } of KEYWORD_MAP) {
      if (keywords.some(k => lower.includes(k))) return template;
    }
    if (attendeeCount === 2) return 'one-on-one';
    return 'default';
  }
}

export const templateClassifier = new TemplateClassifier();
```

- [ ] Step 4: Run test — confirm all 5 fixture cases pass
- [ ] Step 5: Commit `feat(pre-meeting): add TemplateClassifier with keyword-based template detection`

---

### Task 2: ProjectResolver

**Files:**
- Create `electron/services/ProjectResolver.ts`
- Create `electron/services/__tests__/ProjectResolver.test.ts`

- [ ] Step 1: Write failing test — mock project config `[{ id: 'finbiz', keywords: ['finbiz', 'finance'] }, { id: 'cluely', keywords: ['cluely', 'clue.ly'] }]`; assert `resolve({ title: 'Finbiz weekly sync', attendees: [] })` returns `{ projectId: 'finbiz', confidence: 1 }`; assert unknown title returns `{ projectId: null, confidence: 0 }`
- [ ] Step 2: Run test — confirm fail
- [ ] Step 3: Implement `ProjectResolver.ts`:

```typescript
import { CalendarEvent } from './CalendarManager';

export interface ProjectConfig {
  id: string;
  keywords: string[];
}

export interface ResolvedProject {
  projectId: string | null;
  confidence: number;
}

export class ProjectResolver {
  private projects: ProjectConfig[] = [];

  configure(projects: ProjectConfig[]) {
    this.projects = projects;
  }

  resolve(event: Pick<CalendarEvent, 'title' | 'attendees'>): ResolvedProject {
    const text = [event.title, ...(event.attendees ?? [])].join(' ').toLowerCase();
    for (const project of this.projects) {
      if (project.keywords.some(k => text.includes(k.toLowerCase()))) {
        return { projectId: project.id, confidence: 1 };
      }
    }
    return { projectId: null, confidence: 0 };
  }
}

export const projectResolver = new ProjectResolver();
```

- [ ] Step 4: Run test — confirm pass
- [ ] Step 5: Commit `feat(pre-meeting): add ProjectResolver with keyword-based project detection`

---

### Task 3: AttendeeProfiler

**Files:**
- Create `electron/services/AttendeeProfiler.ts`
- Create `electron/services/__tests__/AttendeeProfiler.test.ts`

- [ ] Step 1: Write failing test — mock `EmailManager.getMessagesFromSenders` returning 3 messages for `alice@example.com`; assert `AttendeeProfiler.profile(['alice@example.com'])` returns array with `email: 'alice@example.com'` and `recentEmails.length === 3`; assert empty email list returns `[]`
- [ ] Step 2: Run test — confirm fail
- [ ] Step 3: Implement `AttendeeProfiler.ts`:

```typescript
import { EmailManager, EmailMessage } from './EmailManager';

export interface AttendeeProfile {
  email: string;
  recentEmails: EmailMessage[];
  openItems: string[];      // populated by memory graph when available
  priorDecisions: string[]; // populated by memory graph when available
}

export class AttendeeProfiler {
  private emailManager: EmailManager;

  constructor(emailManager: EmailManager) {
    this.emailManager = emailManager;
  }

  async profile(attendeeEmails: string[]): Promise<AttendeeProfile[]> {
    if (!attendeeEmails.length) return [];
    const emailMap = await this.emailManager.getMessagesFromSenders(attendeeEmails);
    return attendeeEmails.map(email => ({
      email,
      recentEmails: emailMap.get(email) ?? [],
      openItems: [],      // TODO: query memory graph (Composite A)
      priorDecisions: [], // TODO: query memory graph (Composite A)
    }));
  }
}
```

- [ ] Step 4: Run test — confirm pass
- [ ] Step 5: Commit `feat(pre-meeting): add AttendeeProfiler backed by EmailManager`

---

### Task 4: PreBriefComposer

**Files:**
- Create `electron/services/PreBriefComposer.ts`
- Create `electron/services/__tests__/PreBriefComposer.test.ts`

- [ ] Step 1: Write failing test — assert `compose(event, 'finbiz', 'sales', [profile])` returns a `PreBrief` with correct `eventId`, `projectId`, `templateId`, `attendees`, and `firedAt` within 500ms of `Date.now()`
- [ ] Step 2: Run test — confirm fail
- [ ] Step 3: Implement `PreBriefComposer.ts`:

```typescript
import { CalendarEvent } from './CalendarManager';
import { AttendeeProfile } from './AttendeeProfiler';
import { TemplateId } from './TemplateClassifier';

export interface PreBrief {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  projectId: string | null;
  templateId: TemplateId;
  attendees: AttendeeProfile[];
  firedAt: number;
}

export class PreBriefComposer {
  compose(
    event: CalendarEvent,
    projectId: string | null,
    templateId: TemplateId,
    attendees: AttendeeProfile[],
  ): PreBrief {
    return {
      eventId: event.id,
      eventTitle: event.title,
      startsAt: event.startTime,
      projectId,
      templateId,
      attendees,
      firedAt: Date.now(),
    };
  }
}

export const preBriefComposer = new PreBriefComposer();
```

- [ ] Step 4: Run test — confirm pass
- [ ] Step 5: Commit `feat(pre-meeting): add PreBriefComposer`

---

### Task 5: PreMeetingOrchestrator

**Files:**
- Create `electron/services/PreMeetingOrchestrator.ts`
- Create `electron/services/__tests__/PreMeetingOrchestrator.test.ts`

- [ ] Step 1: Write failing integration test — inject a mock `CalendarManager` returning one event starting 4.5 minutes from now; inject mock `ZoomWatcher.isActive()` returning false; run orchestrator for 70 seconds (fake timers); assert `preBriefEmitter.emit` called exactly once with correct `eventId`
- [ ] Step 2: Run test — confirm fail
- [ ] Step 3: Implement `PreMeetingOrchestrator.ts`:

```typescript
import { EventEmitter } from 'events';
import { CalendarManager } from './CalendarManager';
import { ZoomWatcher } from './ZoomWatcher';
import { projectResolver } from './ProjectResolver';
import { templateClassifier } from './TemplateClassifier';
import { AttendeeProfiler } from './AttendeeProfiler';
import { preBriefComposer } from './PreBriefComposer';
import { EmailManager } from './EmailManager';

const LEAD_TIME_MS = 5 * 60_000;   // 5 min before event
const WINDOW_MS = 60_000;           // ± 1 min window
const POLL_INTERVAL_MS = 60_000;

export class PreMeetingOrchestrator extends EventEmitter {
  private static instance: PreMeetingOrchestrator;
  private firedEventIds = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;
  private profiler: AttendeeProfiler;

  private constructor(
    private calendarManager: CalendarManager,
    private zoomWatcher: ZoomWatcher,
  ) {
    super();
    this.profiler = new AttendeeProfiler(EmailManager.getInstance());
  }

  static getInstance(cal = CalendarManager.getInstance(), zoom = ZoomWatcher.getInstance()): PreMeetingOrchestrator {
    if (!PreMeetingOrchestrator.instance) {
      PreMeetingOrchestrator.instance = new PreMeetingOrchestrator(cal, zoom);
    }
    return PreMeetingOrchestrator.instance;
  }

  start() {
    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
    this.tick(); // immediate first run
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async tick() {
    if (this.zoomWatcher.isActive()) return;
    const events = await this.calendarManager.fetchUpcomingEvents().catch(() => []);
    const now = Date.now();
    for (const event of events) {
      const msUntil = new Date(event.startTime).getTime() - now;
      if (msUntil < LEAD_TIME_MS - WINDOW_MS || msUntil > LEAD_TIME_MS + WINDOW_MS) continue;
      if (this.firedEventIds.has(event.id)) continue;
      this.firedEventIds.add(event.id);
      this.fire(event).catch(err => console.error('[PreMeetingOrchestrator] fire error', err));
    }
  }

  private async fire(event: import('./CalendarManager').CalendarEvent) {
    const { projectId } = projectResolver.resolve(event);
    const templateId = templateClassifier.classify(event.title, event.attendees?.length ?? 0);
    const attendees = await this.profiler.profile(event.attendees ?? []);
    const brief = preBriefComposer.compose(event, projectId, templateId, attendees);
    this.emit('pre-meeting:brief-ready', brief);
  }
}
```

- [ ] Step 4: Run integration test — confirm single emission, correct shape
- [ ] Step 5: Confirm dedup test (same event ID second tick) — emit count still 1
- [ ] Step 6: Commit `feat(pre-meeting): add PreMeetingOrchestrator with calendar poll + pipeline`

---

### Task 6: IPC wiring + main.ts integration

**Files:**
- Modify `electron/ipcHandlers.ts`
- Modify `electron/main.ts`

- [ ] Step 1: In `main.ts`, after app `ready`, add:
  ```typescript
  const orchestrator = PreMeetingOrchestrator.getInstance();
  orchestrator.on('pre-meeting:brief-ready', (brief) => {
    BrowserWindow.getAllWindows().forEach(win => win.webContents.send('pre-meeting:brief-ready', brief));
  });
  orchestrator.start();
  ```
- [ ] Step 2: In `ipcHandlers.ts`, add pull handler:
  ```typescript
  ipcMain.handle('pre-meeting:get-last-brief', () => lastBrief);
  ```
  Keep `lastBrief` updated each time orchestrator emits.
- [ ] Step 3: In `electron/preload.ts`, expose:
  ```typescript
  preMeeting: {
    onBriefReady: (cb: (brief: PreBrief) => void) => ipcRenderer.on('pre-meeting:brief-ready', (_, b) => cb(b)),
    getLastBrief: () => ipcRenderer.invoke('pre-meeting:get-last-brief'),
  }
  ```
- [ ] Step 4: Build app with `npm run build`; fix any TypeScript errors
- [ ] Step 5: Commit `feat(pre-meeting): wire PreMeetingOrchestrator into main process and IPC`

---

### Task 7: PreBriefBanner renderer component

**Files:**
- Create `src/components/Launcher/PreBriefBanner.tsx`
- Modify `src/components/Launcher/Launcher.tsx` (or equivalent entry)

- [ ] Step 1: Create `PreBriefBanner.tsx`:
  ```tsx
  import React, { useEffect, useState } from 'react';
  import type { PreBrief } from '../../electron-types'; // shared type

  export function PreBriefBanner() {
    const [brief, setBrief] = useState<PreBrief | null>(null);

    useEffect(() => {
      window.electron.preMeeting.getLastBrief().then(b => { if (b) setBrief(b); });
      window.electron.preMeeting.onBriefReady(setBrief);
    }, []);

    if (!brief) return null;

    return (
      <div className="pre-brief-banner">
        <div className="pre-brief-header">
          <span className="pre-brief-title">{brief.eventTitle}</span>
          <span className="pre-brief-template">{brief.templateId}</span>
          <button onClick={() => setBrief(null)} aria-label="Dismiss">×</button>
        </div>
        {brief.attendees.map(a => (
          <div key={a.email} className="pre-brief-attendee">
            <strong>{a.email}</strong>
            {a.recentEmails[0] && <p>{a.recentEmails[0].subject}</p>}
          </div>
        ))}
      </div>
    );
  }
  ```
- [ ] Step 2: Import and render `<PreBriefBanner />` inside the Launcher component above the main content area
- [ ] Step 3: Run app locally; trigger a calendar event ≤5 min away; verify banner appears
- [ ] Step 4: Verify banner dismisses on `×` click and does not reappear until next event
- [ ] Step 5: Commit `feat(pre-meeting): add PreBriefBanner component to Launcher`
