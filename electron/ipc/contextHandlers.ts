import { ipcMain } from 'electron';
import { MemoryManager } from '../memory/MemoryManager';
import { ProjectContextSwitcher } from '../services/ProjectContextSwitcher';

export function registerContextHandlers(): void {
  const switcher = ProjectContextSwitcher.getInstance();

  ipcMain.handle('project:list', async (_event, labelLike?: string) => {
    try {
      return await MemoryManager.getInstance().findNodes('project', labelLike);
    } catch (err: any) {
      console.error('[project:list]', err);
      return [];
    }
  });

  ipcMain.handle('project:get-active', () => {
    try {
      return {
        projectId: switcher.getActiveProjectId(),
        label: switcher.getActiveProjectLabel(),
      };
    } catch (err: any) {
      console.error('[project:get-active]', err);
      return { projectId: null, label: null };
    }
  });

  ipcMain.handle('project:switch', async (_event, projectId: string, label: string) => {
    try {
      switcher.switch(projectId, label);
      return { success: true };
    } catch (err: any) {
      console.error('[project:switch]', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('project:clear', () => {
    try {
      switcher.clearActive();
      return { success: true };
    } catch (err: any) {
      console.error('[project:clear]', err);
      return { success: false, error: err.message };
    }
  });
}
