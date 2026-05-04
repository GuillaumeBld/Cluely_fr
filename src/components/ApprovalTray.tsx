import { useEffect, useState } from 'react';
import type { WorkflowDraft } from '../types/workflows';
import type { MacroProposal } from '../services/MacroLearner';
import { WorkflowCard } from './WorkflowCard';
import { MacroProposalCard } from './MacroProposalCard';

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
  const [macroProposal, setMacroProposal] = useState<MacroProposal | null>(null);

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

  useEffect(() => {
    const handler = (_event: unknown, payload: { proposal: MacroProposal }) => {
      setMacroProposal(payload.proposal);
    };
    window.electron?.ipcRenderer.on('macro:proposal', handler as (...args: unknown[]) => void);
    return () => {
      window.electron?.ipcRenderer.removeListener('macro:proposal', handler as (...args: unknown[]) => void);
    };
  }, []);

  const handleApprove = async (draft: WorkflowDraft) => {
    try {
      await window.electron?.ipcRenderer.invoke('approval:approve', { draft, meetingId });
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));

      // Notify PatternLearner about the dispatched workflow for macro learning
      window.electron?.ipcRenderer.invoke('macro:observe', {
        id: meetingId,
        project_id: draft.payload?.projectId || 'default',
        meeting_type: draft.payload?.meetingType || draft.templateId,
        template_id: draft.templateId,
        dispatch_target: draft.payload?.title || draft.templateId,
      }).catch(() => {});
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

  if (drafts.length === 0 && !macroProposal) return null;

  return (
    <div className="approval-tray">
      {macroProposal && (
        <MacroProposalCard
          proposal={macroProposal}
          onConfirm={async () => {
            await window.electron?.ipcRenderer.invoke('macro:confirm', { proposal: macroProposal });
            setMacroProposal(null);
          }}
          onDismiss={async () => {
            await window.electron?.ipcRenderer.invoke('macro:dismiss');
            setMacroProposal(null);
          }}
        />
      )}
      {drafts.length > 0 && <h3>Action Items for Approval</h3>}
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
