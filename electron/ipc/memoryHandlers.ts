import { ipcMain } from 'electron';
import { MemoryManager } from '../memory/MemoryManager';
import { NodeKind } from '../memory/schema';

export function registerMemoryHandlers(): void {
  const mm = () => MemoryManager.getInstance();

  ipcMain.handle('memory:get-nodes', (_event, kind?: NodeKind, labelLike?: string) => {
    return mm().findNodes(kind, labelLike);
  });

  ipcMain.handle('memory:get-edges-from', (_event, nodeId: string) => {
    return mm().getEdgesFrom(nodeId);
  });

  ipcMain.handle('memory:get-edges-to', (_event, nodeId: string) => {
    return mm().getEdgesTo(nodeId);
  });

  ipcMain.handle('memory:get-facts', (_event, nodeId: string) => {
    return mm().getFacts(nodeId);
  });

  ipcMain.handle('memory:pending-review', () => {
    return mm().getPendingReview();
  });

  ipcMain.handle('memory:resolve-review', (_event, id: number, approved: boolean) => {
    return mm().resolveReview(id, approved);
  });
}
