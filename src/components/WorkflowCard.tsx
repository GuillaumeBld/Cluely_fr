import { useEffect, useRef, useState } from 'react';
import type { WorkflowDraft } from '../types/workflows';

interface WorkflowCardProps {
  draft: WorkflowDraft;
  onApprove: () => void;
  onDismiss: () => void;
  onEdit: () => void;
}

export function WorkflowCard({ draft, onApprove, onDismiss, onEdit }: WorkflowCardProps) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const isLowConfidence = draft.confidence < 0.5;

  const handleApprove = () => {
    setConfirming(true);
    timerRef.current = setTimeout(() => onApprove(), 3000);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className={`workflow-card ${isLowConfidence ? 'low-confidence' : ''}`}>
      <p className="workflow-title">{draft.payload.title}</p>
      <span className="template-badge">{draft.templateId}</span>
      <span className="confidence">{Math.round(draft.confidence * 100)}%</span>
      {isLowConfidence && <span className="low-confidence-warning">Low Confidence</span>}
      {draft.kbCitations.length > 0 && (
        <ul className="kb-citations">
          {draft.kbCitations.map((c) => (
            <li key={c.id}>{c.label}</li>
          ))}
        </ul>
      )}
      <div className="workflow-actions">
        <button onClick={onEdit}>Preview</button>
        <button onClick={handleApprove} disabled={confirming}>
          {confirming ? 'Confirming...' : 'Approve'}
        </button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}
