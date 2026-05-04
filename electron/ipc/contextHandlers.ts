import { ipcMain } from 'electron';
import { MemoryManager } from '../memory/MemoryManager';
import { ProjectContextSwitcher } from '../services/ProjectContextSwitcher';

export function registerContextHandlers(): void {
  const switcher = ProjectContextSwitcher.getInstance();

  ipcMain.handle('project:list', (_event, labelLike?: string) => {
    return MemoryManager.getInstance().findNodes('project', labelLike);
  });

  ipcMain.handle('project:get-active', () => {
    return {
      projectId: switcher.getActiveProjectId(),
      label: switcher.getActiveProjectLabel(),
    };
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
    switcher.clearActive();
    return { success: true };
  });
}
