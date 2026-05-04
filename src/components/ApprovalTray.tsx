import { useEffect, useState } from 'react';
import type { WorkflowDraft } from '../types/workflows';
import type { MacroProposal } from '../services/MacroLearner';
import { WorkflowCard } from './WorkflowCard';
import { MacroProposalCard } from './MacroProposalCard';

export function ApprovalTray() {
  const [drafts, setDrafts] = useState<WorkflowDraft[]>([]);
  const [meetingId, setMeetingId] = useState<string>('');
  const [macroProposal, setMacroProposal] = useState<MacroProposal | null>(null);

  useEffect(() => {
    const cleanup = window.electronAPI?.on(
      'approval:drafts-ready',
      (payload: { drafts: WorkflowDraft[]; meetingId: string }) => {
        setDrafts(payload.drafts);
        setMeetingId(payload.meetingId);
      },
    );
    return () => { cleanup?.(); };
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI?.on(
      'macro:proposal',
      (payload: { proposal: MacroProposal }) => {
        setMacroProposal(payload.proposal);
      },
    );
    return () => { cleanup?.(); };
  }, []);

  const handleApprove = async (draft: WorkflowDraft) => {
    try {
      await window.electronAPI?.invoke('approval:approve', { draft, meetingId });
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));

      // Notify PatternLearner about the dispatched workflow for macro learning.
      // dispatch_target uses workflow title as a proxy — WorkflowDraft.payload lacks
      // an explicit integration target field. Revisit when payload schema is extended.
      window.electronAPI?.macroObserve({
        id: meetingId,
        project_id: draft.payload?.projectId || 'default',
        meeting_type: draft.payload?.meetingType || draft.templateId,
        template_id: draft.templateId,
        dispatch_target: draft.payload?.title || draft.templateId,
      }).catch((err: unknown) => {
        console.warn('[ApprovalTray] macro:observe failed (non-critical):', err);
      });
    } catch (err) {
      console.error('[ApprovalTray] Approve failed:', err);
    }
  };

  const handleDismiss = async (draft: WorkflowDraft) => {
    try {
      await window.electronAPI?.invoke('approval:dismiss', {
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
            try {
              await window.electronAPI?.macroConfirm(macroProposal);
            } catch (err) {
              console.error('[ApprovalTray] macro:confirm failed:', err);
            } finally {
              setMacroProposal(null);
            }
          }}
          onDismiss={async () => {
            try {
              await window.electronAPI?.macroDismiss();
            } catch (err) {
              console.error('[ApprovalTray] macro:dismiss failed:', err);
            } finally {
              setMacroProposal(null);
            }
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
