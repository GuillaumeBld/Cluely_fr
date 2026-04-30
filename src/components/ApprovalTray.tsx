import { useEffect, useState } from 'react';
import type { WorkflowDraft } from '../types/workflows';
import { WorkflowCard } from './WorkflowCard';

declare global {
  interface Window {
    electron?: {
      ipcRenderer: {
        on(channel: string, listener: (...args: unknown[]) => void): void;
        removeListener(channel: string, listener: (...args: unknown[]) => void): void;
        invoke(channel: string, ...args: unknown[]): Promise<unknown>;
      };
    };
  }
}

export function ApprovalTray() {
  const [drafts, setDrafts] = useState<WorkflowDraft[]>([]);

  useEffect(() => {
    const handler = (_event: unknown, payload: { drafts: WorkflowDraft[] }) => {
      setDrafts(payload.drafts);
    };

    window.electron?.ipcRenderer.on('approval:drafts-ready', handler as (...args: unknown[]) => void);
    return () => {
      window.electron?.ipcRenderer.removeListener('approval:drafts-ready', handler as (...args: unknown[]) => void);
    };
  }, []);

  const handleApprove = async (draft: WorkflowDraft) => {
    await window.electron?.ipcRenderer.invoke('approval:approve', { draft });
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
  };

  const handleDismiss = async (draft: WorkflowDraft) => {
    await window.electron?.ipcRenderer.invoke('approval:dismiss', {
      draftId: draft.id,
      reason: 'user-dismissed',
    });
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
  };

  if (drafts.length === 0) return null;

  return (
    <div className="approval-tray">
      <h3>Action Items for Approval</h3>
      {drafts.map((draft) => (
        <WorkflowCard
          key={draft.id}
          draft={draft}
          onApprove={() => handleApprove(draft)}
          onDismiss={() => handleDismiss(draft)}
          onEdit={() => {}}
        />
      ))}
    </div>
  );
}
