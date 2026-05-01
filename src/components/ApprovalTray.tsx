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
  const [meetingId, setMeetingId] = useState<string>('');

  useEffect(() => {
    const handler = (_event: unknown, payload: { drafts: WorkflowDraft[]; meetingId: string }) => {
      setDrafts(payload.drafts);
      setMeetingId(payload.meetingId);
    };

    window.electron?.ipcRenderer.on('approval:drafts-ready', handler as (...args: unknown[]) => void);
    return () => {
      window.electron?.ipcRenderer.removeListener('approval:drafts-ready', handler as (...args: unknown[]) => void);
    };
  }, []);

  const handleApprove = async (draft: WorkflowDraft) => {
    try {
      await window.electron?.ipcRenderer.invoke('approval:approve', { draft, meetingId });
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    } catch (err) {
      console.error('[ApprovalTray] Approve failed:', err);
    }
  };

  const handleDismiss = async (draft: WorkflowDraft) => {
    try {
      await window.electron?.ipcRenderer.invoke('approval:dismiss', {
        draftId: draft.id,
        meetingId,
        reason: 'user-dismissed',
      });
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    } catch (err) {
      console.error('[ApprovalTray] Dismiss failed:', err);
    }
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
