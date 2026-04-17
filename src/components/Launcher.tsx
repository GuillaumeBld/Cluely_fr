import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, MoreHorizontal, Calendar, Clock, ChevronRight, Settings, RefreshCw, Ghost, Plus, Trash2, Download, Zap, Link as LinkIcon, X } from 'lucide-react';
import { generateMeetingPDF } from '../utils/pdfGenerator';
import icon from "./icon.png";
import ConnectCalendarButton from './ui/ConnectCalendarButton';
import MeetingDetails from './MeetingDetails';
import TopSearchPill from './TopSearchPill';
import GlobalChatOverlay from './GlobalChatOverlay';
import WorkspaceSelector, { Workspace, MULTICA_API, MULTICA_TOKEN } from './WorkspaceSelector';
import MulticaPanel from './MulticaPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { analytics } from '../lib/analytics/analytics.service';
import { useShortcuts } from '../hooks/useShortcuts';

interface Meeting {
    id: string;
    title: string;
    date: string;
    duration: string;
    summary: string;
    detailedSummary?: { actionItems: string[]; keyPoints: string[] };
    transcript?: Array<{ speaker: string; text: string; timestamp: number }>;
    usage?: Array<{ type: 'assist' | 'followup' | 'chat' | 'followup_questions'; timestamp: number; question?: string; answer?: string; items?: string[] }>;
    active?: boolean;
    time?: string;
}

interface LauncherProps {
    onStartMeeting: () => void;
    onOpenSettings: () => void;
}

const getGroupLabel = (dateStr: string) => {
    if (dateStr === "Today") return "Aujourd'hui";
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (checkDate.getTime() === today.getTime()) return "Aujourd'hui";
    if (checkDate.getTime() === yesterday.getTime()) return "Hier";
    return date.toLocaleDateString('fr-FR', { weekday: 'long', month: 'long', day: 'numeric' });
};

const formatTime = (dateStr: string) => {
    if (dateStr === "Aujourd\u2019hui" || dateStr === "Aujourd'hui") return "À l'instant";
    const date = new Date(dateStr);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const formatDurationPill = (durationStr: string) => {
    if (!durationStr) return "00:00";
    if (durationStr.includes(':')) {
        const [mins, secs] = durationStr.split(':');
        return `${mins.padStart(2, '0')}:${(secs || '00')}`;
    }
    const minutes = parseInt(durationStr.replace('min', '').trim()) || 0;
    return `${minutes.toString().padStart(2, '0')}:00`;
};

const formatEventTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const formatEventDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
    if (d.toDateString() === tomorrow.toDateString()) return "Demain";
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

const minutesUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 60000);

// Mini calendar component
const MiniCalendar: React.FC<{ events: any[]; onEventClick: (e: any) => void }> = ({ events, onEventClick: _onEventClick }) => {
    const now = new Date();
    const [viewDate, setViewDate] = useState(now);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Adjust so Monday is first
    const startOffset = (firstDay + 6) % 7;

    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const eventDays = new Set(
        events
            .filter(e => {
                const d = new Date(e.startTime);
                return d.getFullYear() === year && d.getMonth() === month;
            })
            .map(e => new Date(e.startTime).getDate())
    );

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

    const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

    return (
        <div className="w-full select-none">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2 px-1">
                <button onClick={prevMonth} className="p-1 text-text-tertiary hover:text-text-primary transition-colors rounded">
                    <ArrowLeft size={12} />
                </button>
                <span className="text-[11px] font-semibold text-text-secondary capitalize">
                    {viewDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={nextMonth} className="p-1 text-text-tertiary hover:text-text-primary transition-colors rounded">
                    <ArrowRight size={12} />
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
                {dayLabels.map((d, i) => (
                    <div key={i} className="text-center text-[9px] font-medium text-text-tertiary py-0.5">{d}</div>
                ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
                    const hasEvent = eventDays.has(day);
                    const isPast = new Date(year, month, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    return (
                        <div key={i} className="flex flex-col items-center py-0.5">
                            <div className={`
                                w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-medium cursor-default transition-colors
                                ${isToday ? 'bg-sky-500 text-white' : isPast ? 'text-text-tertiary' : 'text-text-secondary hover:bg-white/5'}
                            `}>
                                {day}
                            </div>
                            {hasEvent && (
                                <div className={`w-1 h-1 rounded-full mt-0.5 ${isToday ? 'bg-white/60' : 'bg-sky-400'}`} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const Launcher: React.FC<LauncherProps> = ({ onStartMeeting, onOpenSettings }) => {
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [isDetectable, setIsDetectable] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
    const [isCalendarConnected, setIsCalendarConnected] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [kbContext, setKbContext] = useState<string | null>(null);
    const [emailContext, setEmailContext] = useState<Record<string, Array<{ subject: string; sender: string; date: string; snippet: string; mailbox: string }>> | null>(null);
    const [emailContextExpanded, setEmailContextExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<'meetings' | 'multica'>('meetings');
    const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
    const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
    const [forwardMeeting, setForwardMeeting] = useState<Meeting | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [menuEntered, setMenuEntered] = useState(false);
    const [isGlobalChatOpen, setIsGlobalChatOpen] = useState(false);
    const [submittedGlobalQuery, setSubmittedGlobalQuery] = useState('');
    const [multicaToast, setMulticaToast] = useState<{ count: number; workspaceName: string } | null>(null);

    const { isShortcutPressed } = useShortcuts();

    const fetchMeetings = () => {
        window.electronAPI?.getRecentMeetings?.().then(setMeetings).catch(() => {});
    };

    const fetchEvents = () => {
        window.electronAPI?.getUpcomingEvents?.().then(setUpcomingEvents).catch(() => {});
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await window.electronAPI?.calendarRefresh?.();
            fetchEvents(); fetchMeetings();
        } catch {}
        setTimeout(() => setIsRefreshing(false), 600);
    };

    useEffect(() => {
        window.electronAPI?.invoke?.('seed-demo').catch(() => {});
        window.electronAPI?.getUndetectable?.().then(u => setIsDetectable(!u));

        const cleanups: (() => void)[] = [];

        cleanups.push(window.electronAPI.onMeetingsUpdated(fetchMeetings));
        cleanups.push(window.electronAPI.onUndetectableChanged?.((u) => setIsDetectable(!u)) ?? (() => {}));

        if (window.electronAPI?.onKbContext) {
            cleanups.push(window.electronAPI.onKbContext(ctx => setKbContext(ctx)));
        }
        if (window.electronAPI?.onEmailContext) {
            cleanups.push(window.electronAPI.onEmailContext(payload => {
                setEmailContext(payload);
                setEmailContextExpanded(false);
            }));
        }
        if ((window.electronAPI as any)?.onZoomMeetingDetected) {
            cleanups.push((window.electronAPI as any).onZoomMeetingDetected(() => setShowWorkspaceSelector(true)));
        }
        if (window.electronAPI?.onMulticaIssuesPushed) {
            cleanups.push(window.electronAPI.onMulticaIssuesPushed((data) => {
                setMulticaToast(data);
                setTimeout(() => setMulticaToast(null), 4000);
            }));
        }

        fetchMeetings();
        fetchEvents();

        const interval = setInterval(fetchEvents, 60000);
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isShortcutPressed(e, 'toggleVisibility')) { e.preventDefault(); window.electronAPI.toggleWindow(); }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            cleanups.forEach(fn => fn());
            clearInterval(interval);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isShortcutPressed]);

    useEffect(() => { setMenuEntered(false); }, [activeMenuId]);
    useEffect(() => {
        const close = () => setActiveMenuId(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    // Next meeting = soonest within 2h from now
    const upcomingSorted = [...upcomingEvents].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const nextMeeting = upcomingSorted.find(e => {
        const diff = new Date(e.startTime).getTime() - Date.now();
        return diff > -5 * 60000 && diff < 120 * 60000;
    });
    const futureEvents = upcomingSorted.filter(e => new Date(e.startTime).getTime() > Date.now() - 5 * 60000);

    const handleOpenMeeting = async (meeting: Meeting) => {
        setForwardMeeting(null);
        try {
            const full = await window.electronAPI?.getMeetingDetails?.(meeting.id);
            if (full) { setSelectedMeeting(full); return; }
        } catch {}
        setSelectedMeeting(meeting);
    };

    const groupedMeetings = meetings.reduce((acc, m) => {
        const label = getGroupLabel(m.date);
        if (!acc[label]) acc[label] = [];
        acc[label].push(m);
        return acc;
    }, {} as Record<string, Meeting[]>);

    const sortedGroups = Object.keys(groupedMeetings).sort((a, b) => {
        if (a === "Aujourd'hui") return -1; if (b === "Aujourd'hui") return 1;
        if (a === 'Hier') return -1; if (b === 'Hier') return 1;
        return new Date(b).getTime() - new Date(a).getTime();
    });

    if (!window.electronAPI) return <div className="text-white p-10">Electron API unavailable.</div>;

    return (
        <div className="h-full w-full flex flex-col bg-bg-primary text-text-primary font-sans overflow-hidden selection:bg-sky-500/30">

            {/* ── Header ── */}
            <header className="h-[40px] shrink-0 flex items-center justify-between pl-0 pr-2 drag-region select-none bg-bg-secondary border-b border-border-subtle z-[200]">
                <div className="flex items-center gap-1 no-drag">
                    <div className="w-[70px]" />
                    <button
                        onClick={() => { if (selectedMeeting) { setForwardMeeting(selectedMeeting); setSelectedMeeting(null); } }}
                        disabled={!selectedMeeting}
                        className={`p-1 mt-1 ml-2 transition-colors ${selectedMeeting ? 'text-text-secondary hover:text-text-primary cursor-pointer' : 'text-text-tertiary opacity-40 cursor-default'}`}
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <button
                        onClick={() => { if (forwardMeeting) { setSelectedMeeting(forwardMeeting); setForwardMeeting(null); } }}
                        disabled={!forwardMeeting}
                        className={`p-1 mt-1 transition-colors ${forwardMeeting ? 'text-text-secondary hover:text-text-primary cursor-pointer' : 'text-text-tertiary opacity-0 cursor-default'}`}
                    >
                        <ArrowRight size={16} />
                    </button>

                    {/* Tabs */}
                    <div className="flex items-center gap-1 ml-3 border border-white/10 rounded-full p-0.5">
                        <button onClick={() => setActiveTab('meetings')}
                            className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all ${activeTab === 'meetings' ? 'bg-white/15 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                            Réunions
                        </button>
                        <button onClick={() => setActiveTab('multica')}
                            className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all ${activeTab === 'multica' ? 'bg-white/15 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                            Multica
                        </button>
                    </div>
                </div>

                <TopSearchPill meetings={meetings}
                    onAIQuery={q => { setSubmittedGlobalQuery(q); setIsGlobalChatOpen(true); }}
                    onLiteralSearch={q => { setSubmittedGlobalQuery(q); setIsGlobalChatOpen(true); }}
                    onOpenMeeting={id => { const m = meetings.find(x => x.id === id); if (m) handleOpenMeeting(m); }}
                />

                <div className="flex items-center gap-2 no-drag">
                    <button
                        onClick={handleRefresh}
                        className={`p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-white/5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`}
                        title="Actualiser"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button onClick={onOpenSettings} className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-white/5">
                        <Settings size={14} />
                    </button>
                </div>
            </header>

            {/* ── Body ── */}
            <div className="relative flex-1 flex flex-col overflow-hidden">
                {!isDetectable && (
                    <div className="absolute inset-1 border-2 border-dashed border-white/15 rounded-2xl pointer-events-none z-[100]" />
                )}

                {/* Multica native panel */}
                {activeTab === 'multica' && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <MulticaPanel />
                    </div>
                )}

                {activeTab === 'meetings' && (
                    <AnimatePresence mode="wait">
                        {selectedMeeting ? (
                            <motion.div key="details" className="flex-1 overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                                <MeetingDetails meeting={selectedMeeting} onBack={() => { setForwardMeeting(selectedMeeting); setSelectedMeeting(null); }} onOpenSettings={onOpenSettings} />
                            </motion.div>
                        ) : (
                            <motion.div key="main" className="flex-1 flex overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>

                                {/* ── Left column: meetings list ── */}
                                <div className="flex-1 flex flex-col overflow-hidden border-r border-border-subtle">

                                    {/* Top bar: title + detectable toggle + start button */}
                                    <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 border-b border-border-subtle">
                                        <div className="flex items-center gap-3">
                                            <h1 className="text-base font-semibold text-text-primary tracking-tight">Mes Réunions</h1>
                                            {/* Detectable pill */}
                                            <button
                                                onClick={() => {
                                                    const next = !isDetectable;
                                                    setIsDetectable(next);
                                                    window.electronAPI?.setUndetectable?.(!next);
                                                }}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                                                    isDetectable
                                                        ? 'border-white/10 text-text-tertiary hover:border-white/20'
                                                        : 'border-sky-500/30 text-sky-400 bg-sky-500/10'
                                                }`}
                                                title={isDetectable ? "Mode détectable" : "Mode indétectable"}
                                            >
                                                {isDetectable
                                                    ? <Ghost size={11} />
                                                    : <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 2C7.58 2 4 5.58 4 10v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10c0-4.42-3.58-8-8-8z"/><circle cx="9" cy="10" r="1.5" fill="black"/><circle cx="15" cy="10" r="1.5" fill="black"/></svg>
                                                }
                                                {isDetectable ? 'Détectable' : 'Indétectable'}
                                            </button>
                                        </div>

                                        {/* Start button */}
                                        <button
                                            onClick={() => { setShowWorkspaceSelector(true); analytics.trackCommandExecuted('start_natively_cta'); }}
                                            className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-semibold bg-sky-500 hover:bg-sky-400 text-white transition-all shadow-md shadow-sky-500/20 active:scale-95"
                                        >
                                            <img src={icon} alt="" className="w-3.5 h-3.5 brightness-0 invert" />
                                            Démarrer
                                        </button>
                                    </div>

                                    {/* KB context banner */}
                                    <AnimatePresence>
                                        {kbContext && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                                className="mx-4 mt-3 rounded-xl border border-sky-500/20 bg-sky-950/30 px-3 py-2.5 overflow-hidden"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[9px] font-bold tracking-widest text-sky-400 uppercase mt-0.5 shrink-0">KB</span>
                                                    <p className="text-[11px] text-text-secondary leading-relaxed flex-1 line-clamp-3">{kbContext}</p>
                                                    <button onClick={() => setKbContext(null)} className="shrink-0 text-text-tertiary hover:text-text-primary mt-0.5">
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Email context banner */}
                                    <AnimatePresence>
                                        {emailContext && Object.keys(emailContext).length > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                                className="mx-4 mt-2 rounded-xl border border-emerald-500/20 bg-emerald-950/20 overflow-hidden"
                                            >
                                                <div className="flex items-center gap-2 px-3 py-2 hover:bg-emerald-500/5 transition-colors">
                                                    <span className="text-[9px] font-bold tracking-widest text-emerald-400 uppercase shrink-0">Mail</span>
                                                    <button
                                                        onClick={() => setEmailContextExpanded(v => !v)}
                                                        className="text-[11px] text-text-secondary flex-1 text-left truncate flex items-center gap-2"
                                                    >
                                                        <span className="flex-1 truncate">
                                                            {Object.values(emailContext).reduce((sum, msgs) => sum + msgs.length, 0)} message(s) from {Object.keys(emailContext).length} attendee(s)
                                                        </span>
                                                        <span className="text-text-tertiary text-[10px] shrink-0">{emailContextExpanded ? '▼' : '▶'}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setEmailContext(null)}
                                                        className="shrink-0 text-text-tertiary hover:text-text-primary"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                                <AnimatePresence>
                                                    {emailContextExpanded && (
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                                            className="px-3 pb-3 pt-1 space-y-2 border-t border-emerald-500/10 overflow-hidden"
                                                        >
                                                            {Object.entries(emailContext).map(([sender, msgs]) => (
                                                                <div key={sender}>
                                                                    <div className="text-[10px] font-semibold text-emerald-300/80 mb-1 truncate">{sender}</div>
                                                                    <div className="space-y-1">
                                                                        {msgs.slice(0, 3).map((m, i) => (
                                                                            <div key={i} className="text-[10px] text-text-tertiary leading-snug">
                                                                                <div className="text-text-secondary truncate font-medium">{m.subject || '(no subject)'}</div>
                                                                                <div className="line-clamp-2 opacity-70">{m.snippet}</div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Active workspace badge */}
                                    {activeWorkspace && (
                                        <div className="flex items-center gap-2 px-5 pt-2.5">
                                            <span className="text-[10px] text-text-tertiary">Espace actif</span>
                                            <span className="text-[10px] font-semibold text-sky-400 px-2 py-0.5 bg-sky-500/10 rounded-full border border-sky-500/20">
                                                {activeWorkspace.issue_prefix} · {activeWorkspace.name}
                                            </span>
                                            <button onClick={() => setActiveWorkspace(null)} className="text-[10px] text-text-tertiary hover:text-text-secondary ml-auto">changer</button>
                                        </div>
                                    )}

                                    {/* Meeting list */}
                                    <main className="flex-1 overflow-y-auto custom-scrollbar">
                                        <div className="px-4 py-3 space-y-5">
                                            {sortedGroups.map(label => (
                                                <section key={label}>
                                                    <h3 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">{label}</h3>
                                                    <div className="space-y-0.5">
                                                        {groupedMeetings[label].map(m => (
                                                            <motion.div
                                                                key={m.id}
                                                                className="group relative flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                                                                onClick={() => handleOpenMeeting(m)}
                                                            >
                                                                <span className={`text-[13px] font-medium max-w-[55%] truncate ${m.title === 'Processing...' ? 'text-sky-400 italic animate-pulse' : 'text-text-primary'}`}>
                                                                    {m.title}
                                                                </span>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="bg-white/5 text-text-tertiary text-[9px] px-1.5 py-0.5 rounded-full font-mono min-w-[34px] text-center">
                                                                        {formatDurationPill(m.duration)}
                                                                    </span>
                                                                    <span className="text-[12px] text-text-tertiary font-medium min-w-[42px] text-right transition-all group-hover:opacity-0 group-hover:translate-x-2">
                                                                        {formatTime(m.date)}
                                                                    </span>
                                                                </div>

                                                                {/* Hover actions */}
                                                                <div className="absolute right-2 opacity-0 translate-x-3 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                                                                    <button className="p-1.5 text-text-tertiary hover:text-text-primary"
                                                                        onClick={e => { e.stopPropagation(); setActiveMenuId(activeMenuId === m.id ? null : m.id); }}>
                                                                        <MoreHorizontal size={14} />
                                                                    </button>
                                                                </div>

                                                                <AnimatePresence>
                                                                    {activeMenuId === m.id && (
                                                                        <motion.div
                                                                            initial={{ opacity: 0, scale: 0.95, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                                                            transition={{ duration: 0.1 }}
                                                                            className="absolute right-0 top-full mt-1 w-[100px] bg-[#1E1E20]/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden p-1"
                                                                            onClick={e => e.stopPropagation()}
                                                                            onMouseEnter={() => setMenuEntered(true)}
                                                                            onMouseLeave={() => { if (menuEntered) setActiveMenuId(null); }}
                                                                        >
                                                                            <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-primary hover:bg-white/10 rounded-lg transition-colors text-left"
                                                                                onClick={async () => {
                                                                                    setActiveMenuId(null);
                                                                                    const full = await window.electronAPI?.getMeetingDetails?.(m.id).catch(() => null);
                                                                                    generateMeetingPDF(full || m);
                                                                                }}>
                                                                                <Download size={12} /> Export
                                                                            </button>
                                                                            <button className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                                                                                onClick={async () => {
                                                                                    const ok = await window.electronAPI?.deleteMeeting?.(m.id);
                                                                                    if (ok) setMeetings(prev => prev.filter(x => x.id !== m.id));
                                                                                    setActiveMenuId(null);
                                                                                }}>
                                                                                <Trash2 size={12} /> Supprimer
                                                                            </button>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </motion.div>
                                                        ))}
                                                    </div>
                                                </section>
                                            ))}

                                            {meetings.length === 0 && (
                                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                                        <Clock size={16} className="text-text-tertiary" />
                                                    </div>
                                                    <p className="text-sm text-text-tertiary">Aucune réunion récente</p>
                                                    <p className="text-xs text-text-tertiary/60 mt-1">Démarrez une session pour commencer</p>
                                                </div>
                                            )}
                                        </div>
                                    </main>
                                </div>

                                {/* ── Right column: calendar ── */}
                                <div className="w-[240px] shrink-0 flex flex-col overflow-hidden bg-bg-secondary">

                                    {/* Next event hero */}
                                    {nextMeeting ? (
                                        <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                                    {minutesUntil(nextMeeting.startTime) <= 0 ? 'En cours' : `Dans ${minutesUntil(nextMeeting.startTime)} min`}
                                                </span>
                                            </div>
                                            <p className="text-[12px] font-semibold text-text-primary line-clamp-2 leading-tight mb-1">{nextMeeting.title}</p>
                                            <p className="text-[10px] text-text-tertiary mb-3">
                                                {formatEventTime(nextMeeting.startTime)} – {formatEventTime(nextMeeting.endTime)}
                                            </p>
                                            <button
                                                onClick={() => { setShowWorkspaceSelector(true); analytics.trackCommandExecuted('start_from_calendar'); }}
                                                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-[11px] font-semibold border border-emerald-500/20 transition-all"
                                            >
                                                <Zap size={11} />
                                                Rejoindre
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
                                            <p className="text-[11px] text-text-tertiary">Aucune réunion prochaine</p>
                                        </div>
                                    )}

                                    {/* Mini calendar */}
                                    <div className="px-3 pt-3 pb-2 border-b border-border-subtle">
                                        <MiniCalendar events={upcomingEvents} onEventClick={() => {}} />
                                    </div>

                                    {/* Upcoming event list */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                                        {!isCalendarConnected ? (
                                            <div className="flex flex-col items-center justify-center h-full px-4 py-6 text-center gap-3">
                                                <Calendar size={20} className="text-text-tertiary" />
                                                <p className="text-[11px] text-text-secondary leading-relaxed">Connectez votre calendrier pour voir vos événements</p>
                                                <ConnectCalendarButton onConnect={() => setIsCalendarConnected(true)} />
                                            </div>
                                        ) : futureEvents.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full px-4 py-6 text-center">
                                                <p className="text-[11px] text-text-tertiary">Aucun événement à venir</p>
                                            </div>
                                        ) : (
                                            <div className="px-3 py-2 space-y-px">
                                                {futureEvents.slice(0, 12).map((ev, i) => {
                                                    const mins = minutesUntil(ev.startTime);
                                                    const isNext = ev === nextMeeting;
                                                    return (
                                                        <div key={ev.id || i}
                                                            className={`flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors cursor-default ${isNext ? 'bg-emerald-500/10' : 'hover:bg-white/5'}`}
                                                        >
                                                            <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                                                                <span className="text-[9px] font-bold text-text-tertiary uppercase">
                                                                    {formatEventDate(ev.startTime)}
                                                                </span>
                                                                <span className="text-[10px] font-semibold text-text-secondary">
                                                                    {formatEventTime(ev.startTime)}
                                                                </span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`text-[11px] font-medium truncate ${isNext ? 'text-emerald-300' : 'text-text-primary'}`}>
                                                                    {ev.title}
                                                                </p>
                                                                {ev.link && (
                                                                    <p className="text-[9px] text-sky-400/70 flex items-center gap-1 mt-0.5">
                                                                        <LinkIcon size={8} /> Lien disponible
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Connect calendar footer if not connected */}
                                    {isCalendarConnected && (
                                        <div className="px-3 py-2 border-t border-border-subtle">
                                            <button
                                                onClick={handleRefresh}
                                                className={`w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-white/5 transition-all ${isRefreshing ? 'animate-pulse' : ''}`}
                                            >
                                                <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
                                                Actualiser le calendrier
                                            </button>
                                        </div>
                                    )}
                                </div>

                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>

            {/* Global Chat */}
            <GlobalChatOverlay
                isOpen={isGlobalChatOpen}
                onClose={() => { setIsGlobalChatOpen(false); setSubmittedGlobalQuery(''); }}
                initialQuery={submittedGlobalQuery}
            />

            {/* Multica push toast */}
            <AnimatePresence>
                {multicaToast && (
                    <motion.div
                        key="multica-toast"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[600] bg-sky-600 text-white text-xs font-medium px-4 py-2 rounded-xl shadow-lg pointer-events-none"
                    >
                        {multicaToast.count} action item{multicaToast.count !== 1 ? 's' : ''} pushed to {multicaToast.workspaceName}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Workspace Selector */}
            <AnimatePresence>
                {showWorkspaceSelector && (
                    <WorkspaceSelector
                        onSelect={ws => {
                            setShowWorkspaceSelector(false);
                            setActiveWorkspace(ws);
                            if (ws) {
                                window.electronAPI?.invoke?.('start-meeting', { multicaWorkspaceId: ws.id, multicaWorkspaceName: ws.name }).catch(() => {});
                            } else {
                                onStartMeeting();
                            }
                        }}
                        onCancel={() => setShowWorkspaceSelector(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Launcher;
