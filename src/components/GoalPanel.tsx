import React, { useState, useEffect } from 'react';
import { Plus, Check } from 'lucide-react';

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

  const load = async () => {
    const all = await window.electronAPI?.goalList?.() ?? [];
    setGoals((all as Goal[]).filter(g => !g.completed_at));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await window.electronAPI?.goalCreate?.({ title: newTitle.trim() });
    setNewTitle('');
    load();
  };

  const handleComplete = async (id: string) => {
    await window.electronAPI?.goalComplete?.(id);
    if (selectedGoalId === id) onSelectGoal(null);
    load();
  };

  return (
    <div className="p-4 space-y-3 border-b border-border-subtle">
      <h3 className="text-sm font-semibold text-text-primary">Objectifs</h3>
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
              title="Marquer comme terminé"
            >
              <Check size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="Nouveau objectif…"
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
    </div>
  );
};

export default GoalPanel;
