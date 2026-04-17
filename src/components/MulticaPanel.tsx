import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Loader2, RefreshCw, Circle, CheckCircle2, Clock, AlertCircle, ChevronDown } from 'lucide-react';

interface Workspace {
    id: string;
    name: string;
    slug: string;
    issue_prefix: string;
}

interface Issue {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    number: number;
    workspace_id: string;
    created_at: string;
}

const STATUS_ORDER = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'];

const STATUS_LABEL: Record<string, string> = {
    backlog: 'Backlog',
    todo: 'À faire',
    in_progress: 'En cours',
    done: 'Terminé',
    cancelled: 'Annulé',
};

const STATUS_COLOR: Record<string, string> = {
    backlog: 'text-text-tertiary',
    todo: 'text-sky-400',
    in_progress: 'text-amber-400',
    done: 'text-green-400',
    cancelled: 'text-red-400/60',
};

const PRIORITY_COLOR: Record<string, string> = {
    urgent: 'bg-red-500',
    high: 'bg-orange-400',
    medium: 'bg-amber-400',
    low: 'bg-sky-400',
    none: 'bg-white/20',
};

const StatusIcon = ({ status }: { status: string }) => {
    const cls = `w-3.5 h-3.5 ${STATUS_COLOR[status] || 'text-text-tertiary'}`;
    if (status === 'done') return <CheckCircle2 className={cls} />;
    if (status === 'in_progress') return <Clock className={cls} />;
    if (status === 'cancelled') return <AlertCircle className={cls} />;
    return <Circle className={cls} />;
};

const MulticaPanel: React.FC = () => {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [activeWs, setActiveWs] = useState<Workspace | null>(null);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newPriority, setNewPriority] = useState('medium');
    const [saving, setSaving] = useState(false);
    const [wsDropdown, setWsDropdown] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const eAPI = (window as any).electronAPI;

    const loadWorkspaces = useCallback(async () => {
        const data = await eAPI?.multicaGetWorkspaces?.();
        if (Array.isArray(data) && data.length > 0) {
            setWorkspaces(data);
            setActiveWs((prev) => prev ?? data[0]);
            return data;
        }
        return [];
    }, []);

    const loadIssues = useCallback(async (wsId: string) => {
        const data = await eAPI?.multicaGetIssues?.(wsId);
        const list = Array.isArray(data) ? data : (data?.issues ?? []);
        setIssues(list);
    }, []);

    // Check if already ready, then subscribe to future status changes
    useEffect(() => {
        eAPI?.multicaIsReady?.().then((res: { ready: boolean }) => {
            if (res?.ready) {
                setIsReady(true);
                loadWorkspaces().then((ws) => { if (ws.length > 0) loadIssues(ws[0].id); });
                setLoading(false);
            }
        });

        const unsub = eAPI?.onMulticaStatusChange?.(
            (data: { status: 'ready' | 'failed'; error?: string }) => {
                if (data.status === 'ready') {
                    setIsReady(true);
                    loadWorkspaces().then((ws) => { if (ws.length > 0) loadIssues(ws[0].id); });
                } else {
                    setLoadError(data.error || 'Multica failed to start');
                }
                setLoading(false);
            }
        );

        return () => unsub?.();
    }, []);

    // Load issues when workspace changes
    useEffect(() => {
        if (activeWs) loadIssues(activeWs.id);
    }, [activeWs?.id]);

    const refresh = async () => {
        if (!activeWs) return;
        setRefreshing(true);
        await loadIssues(activeWs.id);
        setRefreshing(false);
    };

    const handleCreate = async () => {
        if (!newTitle.trim() || !activeWs) return;
        setSaving(true);
        await eAPI?.multicaCreateIssue?.({
            workspaceId: activeWs.id,
            title: newTitle.trim(),
            priority: newPriority,
        });
        setNewTitle('');
        setCreating(false);
        setSaving(false);
        await loadIssues(activeWs.id);
    };

    const grouped = STATUS_ORDER.reduce((acc, s) => {
        acc[s] = issues.filter((i) => i.status === s);
        return acc;
    }, {} as Record<string, Issue[]>);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                    <Loader2 size={20} className="animate-spin text-text-tertiary mx-auto" />
                    <p className="text-xs text-text-tertiary">Démarrage Multica...</p>
                </div>
            </div>
        );
    }

    if (!isReady) {
        return (
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center space-y-2">
                    <AlertCircle size={20} className="text-amber-400 mx-auto" />
                    <p className="text-xs text-text-secondary">Multica non disponible</p>
                    {loadError && <p className="text-[10px] text-red-400">{loadError}</p>}
                    <p className="text-[10px] text-text-tertiary">Vérifiez que PostgreSQL est actif</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle shrink-0">
                {/* Workspace picker */}
                <div className="relative">
                    <button
                        onClick={() => setWsDropdown(!wsDropdown)}
                        className="flex items-center gap-1.5 text-xs font-medium text-text-primary hover:text-text-primary/80 transition-colors"
                    >
                        <span className="w-5 h-5 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center text-[9px] font-bold shrink-0">
                            {activeWs?.issue_prefix?.slice(0, 2) || '?'}
                        </span>
                        <span>{activeWs?.name || 'Espace'}</span>
                        <ChevronDown size={11} className="text-text-tertiary" />
                    </button>
                    <AnimatePresence>
                        {wsDropdown && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.1 }}
                                className="absolute top-full left-0 mt-1 z-50 w-48 bg-bg-secondary border border-border-subtle rounded-xl shadow-xl overflow-hidden"
                            >
                                {workspaces.map((ws) => (
                                    <button
                                        key={ws.id}
                                        onClick={() => { setActiveWs(ws); setWsDropdown(false); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${activeWs?.id === ws.id ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:bg-white/5'}`}
                                    >
                                        <span className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[9px] font-bold shrink-0">
                                            {ws.issue_prefix.slice(0, 2)}
                                        </span>
                                        {ws.name}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={refresh}
                        className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/5 transition-colors"
                    >
                        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setCreating(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-medium transition-colors"
                    >
                        <Plus size={11} />
                        Créer
                    </button>
                </div>
            </div>

            {/* Create issue form */}
            <AnimatePresence>
                {creating && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-b border-border-subtle shrink-0"
                    >
                        <div className="px-4 py-3 space-y-2">
                            <input
                                autoFocus
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreate();
                                    if (e.key === 'Escape') { setCreating(false); setNewTitle(''); }
                                }}
                                placeholder="Titre de l'issue..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-sky-500/50"
                            />
                            <div className="flex items-center gap-2">
                                <select
                                    value={newPriority}
                                    onChange={(e) => setNewPriority(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-text-secondary outline-none"
                                >
                                    <option value="urgent">Urgent</option>
                                    <option value="high">Haute</option>
                                    <option value="medium">Moyenne</option>
                                    <option value="low">Basse</option>
                                </select>
                                <button
                                    onClick={handleCreate}
                                    disabled={!newTitle.trim() || saving}
                                    className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-[10px] font-medium transition-colors flex items-center gap-1"
                                >
                                    {saving && <Loader2 size={9} className="animate-spin" />}
                                    {saving ? 'Création...' : 'Créer'}
                                </button>
                                <button
                                    onClick={() => { setCreating(false); setNewTitle(''); }}
                                    className="px-2 py-1 rounded-lg text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Issues list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
                {issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                        <p className="text-xs text-text-tertiary">Aucune issue dans cet espace</p>
                        <button
                            onClick={() => setCreating(true)}
                            className="mt-2 text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
                        >
                            + Créer la première
                        </button>
                    </div>
                ) : (
                    STATUS_ORDER.filter((s) => grouped[s]?.length > 0).map((status) => (
                        <div key={status}>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <StatusIcon status={status} />
                                <span className={`text-[10px] font-medium ${STATUS_COLOR[status]}`}>
                                    {STATUS_LABEL[status]}
                                </span>
                                <span className="text-[9px] text-text-tertiary ml-0.5">
                                    {grouped[status].length}
                                </span>
                            </div>
                            <div className="space-y-0.5">
                                {grouped[status].map((issue) => (
                                    <motion.div
                                        key={issue.id}
                                        initial={{ opacity: 0, x: -4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 group transition-colors cursor-default"
                                    >
                                        <div
                                            className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${PRIORITY_COLOR[issue.priority] || 'bg-white/20'}`}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-text-primary leading-snug truncate">
                                                {issue.title}
                                            </p>
                                            <p className="text-[9px] text-text-tertiary mt-0.5">
                                                {activeWs?.issue_prefix}-{issue.number}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default MulticaPanel;
