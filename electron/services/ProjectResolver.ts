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
