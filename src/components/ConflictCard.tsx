import React from 'react';

export interface ConflictCardProps {
  entity: string;
  relation: string;
  oldValue: string;
  newValue: string;
  speaker: string | null;
  factId: number;
  onResolve: (action: 'update' | 'ignore' | 'flag') => void;
}

export function ConflictCard({
  entity,
  relation,
  oldValue,
  newValue,
  speaker,
  onResolve,
}: ConflictCardProps) {
  return (
    <div className="rounded-lg bg-[#1E1E1E]/80 backdrop-blur-md border border-amber-500/30 p-3 shadow-lg">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-amber-400 text-xs font-medium uppercase tracking-wide">
          Memory Conflict
        </span>
      </div>

      <p className="text-white/90 text-sm mb-1">
        <strong className="text-white">{entity}</strong>
        <span className="text-white/50 mx-1">·</span>
        <span className="text-white/60">{relation}</span>
      </p>

      <div className="flex flex-col gap-1 mb-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-red-400/80 line-through">{oldValue}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-400">{newValue}</span>
          {speaker && (
            <span className="text-white/40 text-xs">— {speaker}</span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onResolve('update')}
          className="flex-1 px-2 py-1.5 rounded-md bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-600/30 transition-colors"
        >
          Update Graph
        </button>
        <button
          onClick={() => onResolve('ignore')}
          className="flex-1 px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/60 text-xs font-medium hover:bg-white/10 transition-colors"
        >
          Ignore
        </button>
        <button
          onClick={() => onResolve('flag')}
          className="flex-1 px-2 py-1.5 rounded-md bg-amber-600/20 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-600/30 transition-colors"
        >
          Flag
        </button>
      </div>
    </div>
  );
}
