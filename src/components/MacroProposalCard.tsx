import type { MacroProposal } from '../services/MacroLearner';

interface MacroProposalCardProps {
  proposal: MacroProposal;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function MacroProposalCard({ proposal, onConfirm, onDismiss }: MacroProposalCardProps) {
  return (
    <div className="macro-proposal-card">
      <p>
        We noticed 2 <strong>{proposal.meetingType}</strong> meetings for{' '}
        <strong>{proposal.projectId}</strong>.
      </p>
      <p>Save this pipeline config as a macro? Template: {proposal.templateId}</p>
      <div className="macro-proposal-actions">
        <button onClick={onConfirm}>Save Macro</button>
        <button onClick={onDismiss}>Not now</button>
      </div>
    </div>
  );
}
