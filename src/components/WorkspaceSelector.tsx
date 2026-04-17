import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Loader2, Check, ArrowLeft } from 'lucide-react';

const MULTICA_API = 'http://localhost:8091';
const MULTICA_TOKEN = ''; // Always use IPC in Electron; this fallback is for browser dev only

// Use IPC proxy when running inside Electron (avoids CSP block on http://)
const api = {
  getWorkspaces: (): Promise<any> => {
    const ipc = (window as any).electronAPI?.multicaGetWorkspaces;
    if (typeof ipc === 'function') {
      console.log('[WorkspaceSelector] using IPC proxy');
      return ipc();
    }
    console.log('[WorkspaceSelector] falling back to direct fetch');
    return fetch(`${MULTICA_API}/api/workspaces`, { headers: { Authorization: `Bearer ${MULTICA_TOKEN}` } }).then(r => r.json());
  },
  createWorkspace: (name: string, slug: string): Promise<any> => {
    const ipc = (window as any).electronAPI?.multicaCreateWorkspace;
    if (typeof ipc === 'function') return ipc(name, slug);
    return fetch(`${MULTICA_API}/api/workspaces`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MULTICA_TOKEN}` }, body: JSON.stringify({ name, slug }) }).then(r => r.json());
  },
};

interface Workspace {
  id: string;
  name: string;
  slug: string;
  issue_prefix: string;
}

interface WorkspaceSelectorProps {
  onSelect: (workspace: Workspace | null) => void;
  onCancel: () => void;
}

const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({ onSelect, onCancel }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchWorkspaces = () => {
    return api.getWorkspaces()
      .then((data: any) => {
        console.log('[WorkspaceSelector] raw data:', data, 'isArray:', Array.isArray(data));
        if (Array.isArray(data)) setWorkspaces(data);
        else setError('Format inattendu: ' + JSON.stringify(data)?.slice(0, 80));
      })
      .catch((e: any) => { console.error('[WorkspaceSelector] fetch error:', e); setError('Erreur: ' + e?.message); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchWorkspaces(); }, []);

  useEffect(() => {
    if (creating) setTimeout(() => inputRef.current?.focus(), 50);
  }, [creating]);

  const slugify = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const data = await api.createWorkspace(newName.trim(), slugify(newName.trim()));
      if (!data || data.error) {
        setError(data?.error || 'Erreur lors de la création');
        return;
      }
      const ws: Workspace = data;
      setWorkspaces((prev) => [...prev, ws]);
      setSelected(ws.id);
      setCreating(false);
      setNewName('');
    } catch {
      setError('Serveur Multica inaccessible');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = () => {
    if (selected === 'other') { onSelect(null); return; }
    const ws = workspaces.find((w) => w.id === selected);
    onSelect(ws || null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="w-[340px] rounded-2xl bg-bg-secondary border border-border-subtle shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            {creating && (
              <button onClick={() => { setCreating(false); setNewName(''); setError(''); }}
                className="text-text-tertiary hover:text-text-primary transition-colors">
                <ArrowLeft size={14} />
              </button>
            )}
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                {creating ? 'Nouvel espace de travail' : 'Quel espace de travail ?'}
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {creating ? 'Créez-le et démarrez directement.' : 'Les actions seront créées dans cet espace.'}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 pb-2 space-y-1">
          <AnimatePresence mode="wait">
            {creating ? (
              <motion.div key="create" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="px-2 py-2 space-y-3">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); }}}
                  placeholder="Nom de l'espace..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-sky-500/50 transition-colors"
                />
                {newName && (
                  <div className="text-[10px] text-text-tertiary px-1">
                    URL: multica.ai/<span className="text-text-secondary">{slugify(newName)}</span>
                  </div>
                )}
                {error && <div className="text-[10px] text-red-400 px-1">{error}</div>}
              </motion.div>
            ) : (
              <motion.div key="list" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="space-y-1">
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-text-secondary">
                    <Loader2 size={16} className="animate-spin mr-2" />
                    <span className="text-xs">Chargement...</span>
                  </div>
                ) : (
                  <>
                    {workspaces.map((ws) => (
                      <button key={ws.id} onClick={() => setSelected(ws.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                          selected === ws.id ? 'bg-sky-500/20 border border-sky-500/40' : 'hover:bg-white/5 border border-transparent'}`}>
                        <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-text-primary shrink-0">
                          {ws.issue_prefix.slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-text-primary">{ws.name}</div>
                          <div className="text-[10px] text-text-secondary">{ws.issue_prefix}-*</div>
                        </div>
                        {selected === ws.id && <Check size={13} className="ml-auto text-sky-400" />}
                      </button>
                    ))}

                    {/* Create new — inline */}
                    <button onClick={() => setCreating(true)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/5 border border-dashed border-white/10 transition-all">
                      <div className="w-7 h-7 rounded-lg border border-dashed border-white/20 flex items-center justify-center shrink-0">
                        <Plus size={12} className="text-text-tertiary" />
                      </div>
                      <span className="text-xs text-text-secondary">Créer un espace de travail</span>
                    </button>

                    {/* Other */}
                    <button onClick={() => setSelected('other')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                        selected === 'other' ? 'bg-white/10 border border-white/20' : 'hover:bg-white/5 border border-transparent'}`}>
                      <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <span className="text-xs text-text-tertiary">—</span>
                      </div>
                      <span className="text-xs text-text-secondary">Autre / sans espace de travail</span>
                      {selected === 'other' && <Check size={13} className="ml-auto text-white/40" />}
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-4 border-t border-border-subtle">
          <button onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all">
            Annuler
          </button>
          {creating ? (
            <button onClick={handleCreate} disabled={!newName.trim() || saving}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all flex items-center justify-center gap-1.5">
              {saving && <Loader2 size={11} className="animate-spin" />}
              {saving ? 'Création...' : 'Créer et démarrer'}
            </button>
          ) : (
            <button onClick={handleConfirm} disabled={!selected}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all">
              Démarrer
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default WorkspaceSelector;
export type { Workspace };
export { MULTICA_API, MULTICA_TOKEN };
