import React, { useState, useEffect } from 'react';
import { Plus, Check } from 'lucide-react';
import { useT } from '../i18n';

interface Goal {
  id: string;
  title: string;
  description: string;
  parent_id: string | null;
  created_at: number;
  completed_at: number | null;
}

interface GoalPanelProps {
  onSelectGoal: (goalId: string | null) => void;
  selectedGoalId: string | null;
}

const GoalPanel: React.FC<GoalPanelProps> = ({ onSelectGoal, selectedGoalId }) => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const { t } = useT();

  const load = async () => {
    try {
      const all = await window.electronAPI?.goalList?.() ?? [];
      setGoals(all.filter(g => !g.completed_at));
    } catch (err) {
      console.error('[GoalPanel] Failed to load goals:', err);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreateError(null);
    try {
      const result = await window.electronAPI?.goalCreate?.({ title: newTitle.trim() });
      if (result && 'error' in result) {
        setCreateError(result.error);
        return;
      }
    } catch (err) {
      console.error('[GoalPanel] Failed to create goal:', err);
      return;
    }
    setNewTitle('');
    load();
  };

  const handleComplete = async (id: string) => {
    try {
      await window.electronAPI?.goalComplete?.(id);
    } catch (err) {
      console.error('[GoalPanel] Failed to complete goal:', err);
      return;
    }
    if (selectedGoalId === id) onSelectGoal(null);
    load();
  };

  return (
    <div className="p-4 space-y-3 border-b border-border-subtle">
      <h3 className="text-sm font-semibold text-text-primary">{t('goal_panel_title')}</h3>
      <ul className="space-y-2">
        {goals.map(g => (
          <li
            key={g.id}
            onClick={() => onSelectGoal(g.id === selectedGoalId ? null : g.id)}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors
              ${g.id === selectedGoalId ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-bg-tertiary hover:bg-bg-hover'}`}
          >
            <span className="text-sm text-text-secondary truncate flex-1">{g.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleComplete(g.id); }}
              className="ml-2 text-text-tertiary hover:text-emerald-500 transition-colors"
              title={t('goal_mark_done')}
            >
              <Check size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder={t('goal_new_placeholder')}
            className="flex-1 text-sm bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-1.5 text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-blue-500/50"
          />
          <button
            onClick={handleCreate}
            disabled={!newTitle.trim()}
            className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-40 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        {createError && (
          <span className="text-xs text-red-400">{createError}</span>
        )}
      </div>
    </div>
  );
};

export default GoalPanel;
