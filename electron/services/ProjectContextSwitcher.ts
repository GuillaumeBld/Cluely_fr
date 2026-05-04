import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

export class ProjectContextSwitcher {
  private static instance: ProjectContextSwitcher;
  private activeProjectId: string | null = null;
  private activeProjectLabel: string | null = null;
  private filePath: string;

  private constructor() {
    this.filePath = path.join(app.getPath('userData'), 'active-project.json');
    this.load();
  }

  public static getInstance(): ProjectContextSwitcher {
    if (!ProjectContextSwitcher.instance) {
      ProjectContextSwitcher.instance = new ProjectContextSwitcher();
    }
    return ProjectContextSwitcher.instance;
  }

  /** Reset singleton (for tests). */
  public static resetInstance(): void {
    ProjectContextSwitcher.instance = undefined as any;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        this.activeProjectId = data.projectId ?? null;
        this.activeProjectLabel = data.label ?? null;
      }
    } catch (err) {
      console.error('[ProjectContextSwitcher] Failed to load persisted state:', err);
      this.activeProjectId = null;
      this.activeProjectLabel = null;
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify({
        projectId: this.activeProjectId,
        label: this.activeProjectLabel,
      }, null, 2));
    } catch (err) {
      console.error('[ProjectContextSwitcher] Failed to persist state:', err);
    }
  }

  private removePersisted(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch (err) {
      console.error('[ProjectContextSwitcher] Failed to remove persisted state:', err);
    }
  }

  private broadcastChange(): void {
    const payload = { projectId: this.activeProjectId, label: this.activeProjectLabel };
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) {
        w.webContents.send('project:context-changed', payload);
      }
    });
  }

  public getActiveProjectId(): string | null {
    return this.activeProjectId;
  }

  public getActiveProjectLabel(): string | null {
    return this.activeProjectLabel;
  }

  public switch(projectId: string, label: string): void {
    this.activeProjectId = projectId;
    this.activeProjectLabel = label;
    this.persist();
    this.broadcastChange();
  }

  public clearActive(): void {
    this.activeProjectId = null;
    this.activeProjectLabel = null;
    this.removePersisted();
    this.broadcastChange();
  }
}
