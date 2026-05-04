import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { useT } from '../i18n';

interface OpenCommitment {
  text: string;
  meeting_id: string;
  goal_id: string;
  meeting_date: string;
}

interface PreCallHintProps {
  goalId: string | null;
}

const PreCallHint: React.FC<PreCallHintProps> = ({ goalId }) => {
  const [hints, setHints] = useState<OpenCommitment[]>([]);
  const { t } = useT();

  useEffect(() => {
    if (!goalId) { setHints([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const items = await window.electronAPI?.goalPreCallHint?.(goalId);
        if (!cancelled) setHints(items ?? []);
      } catch (err) {
        console.warn('[PreCallHint] Failed to load hints:', err);
        if (!cancelled) setHints([]);
      }
    })();
    return () => { cancelled = true; };
  }, [goalId]);

  if (!goalId || hints.length === 0) return null;

  return (
    <div className="mx-4 mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
      <div className="flex items-center gap-1.5 mb-2">
        <AlertCircle size={12} className="text-amber-400" />
        <span className="text-xs font-medium text-amber-400">
          {t('goal_open_items').replace('{n}', String(hints.length))}
        </span>
      </div>
      <ul className="space-y-1">
        {hints.map((h, i) => (
          <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
            <span className="mt-1 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
            <span className="truncate">{h.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PreCallHint;
