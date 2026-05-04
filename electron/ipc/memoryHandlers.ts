import { ipcMain } from 'electron';
import { MemoryManager } from '../memory/MemoryManager';
import { NodeKind } from '../memory/schema';
import { AppState } from '../main';

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

  ipcMain.handle(
    'memory:find-similar',
    async (_event, text: string, k: number = 5, kindFilter?: NodeKind) => {
      if (typeof text !== 'string' || !text.trim()) return { error: 'text required' };
      const appState = AppState.getInstance();
      const ragManager = appState?.getRAGManager();
      if (!ragManager) return { error: 'RAGManager not available' };
      const pipeline = ragManager.getEmbeddingPipeline();
      if (!pipeline.isReady()) return { error: 'EmbeddingPipeline not ready' };
      try {
        const queryVector = await pipeline.getEmbedding(text);
        const results = mm().findSimilar(queryVector, k, kindFilter);
        return { success: true, results };
      } catch (err: any) {
        console.error('[memory:find-similar]', err);
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    'memory:embed-fact',
    async (_event, factId: number, text: string) => {
      if (typeof factId !== 'number') return { error: 'factId must be a number' };
      if (typeof text !== 'string' || !text.trim()) return { error: 'text required' };
      const appState = AppState.getInstance();
      const ragManager = appState?.getRAGManager();
      if (!ragManager) return { error: 'RAGManager not available' };
      const pipeline = ragManager.getEmbeddingPipeline();
      if (!pipeline.isReady()) return { error: 'EmbeddingPipeline not ready' };
      try {
        const embedding = await pipeline.getEmbedding(text);
        mm().storeFactEmbedding(factId, embedding);
        return { success: true };
      } catch (err: any) {
        console.error('[memory:embed-fact]', err);
        return { success: false, error: err.message };
      }
    }
  );
}
