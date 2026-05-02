import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardSnapshot {
  projectId: string;
  content: string;
  fetchedAt: string;
  stale: boolean;
}

function parseStatus(content: string): string {
  const match = content.match(/\*\*Status:\*\*\s*(\S+)/);
  return match?.[1] ?? 'unknown';
}

function countAlerts(content: string): number {
  const section = content.split('## Alerts')[1];
  if (!section) return 0;
  return (section.match(/^- /gm) ?? []).length;
}

function statusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'text-emerald-400';
    case 'degraded':
      return 'text-amber-400';
    default:
      return 'text-red-400';
  }
}

function statusDot(status: string): string {
  switch (status) {
    case 'healthy':
      return 'bg-emerald-400';
    case 'degraded':
      return 'bg-amber-400';
    default:
      return 'bg-red-400';
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function DispatchDashboard() {
  const [snapshots, setSnapshots] = useState<DashboardSnapshot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.dashboard) return;

    api.dashboard.getSnapshots().then((s: DashboardSnapshot[]) => {
      if (Array.isArray(s)) setSnapshots(s);
    }).catch((err: unknown) => {
      console.warn('[DispatchDashboard] Failed to fetch snapshots:', err);
    });

    const cleanup = api.dashboard.onSnapshotsUpdated((s: DashboardSnapshot[]) => {
      if (Array.isArray(s)) setSnapshots(s);
    });
    return cleanup;
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const api = (window as any).electronAPI;
      await api?.dashboard?.refresh();
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AnimatePresence>
      {!dismissed && snapshots.length > 0 && (
        <motion.div
          key="dispatch-dashboard"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mx-4 mt-3 rounded-xl border border-violet-500/20 bg-violet-950/20 overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[9px] font-bold tracking-widest text-violet-400 uppercase shrink-0">
              Dispatch
            </span>
            <span className="flex-1" />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
              aria-label="Dismiss"
            >
              <X size={11} />
            </button>
          </div>

          <div className="px-3 pb-2.5 pt-1 space-y-1 border-t border-violet-500/10">
            {snapshots.map(snap => {
              const status = parseStatus(snap.content);
              const alerts = countAlerts(snap.content);
              return (
                <div key={snap.projectId} className="flex items-center gap-2 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(status)}`} />
                  <span className="font-semibold text-violet-300/80 w-28 truncate">{snap.projectId}</span>
                  <span className={`${statusColor(status)} w-16`}>{status}</span>
                  {alerts > 0 && (
                    <span className="text-amber-400">{alerts} alert{alerts > 1 ? 's' : ''}</span>
                  )}
                  {snap.stale && (
                    <span className="text-text-tertiary bg-white/5 px-1 py-0.5 rounded text-[8px]">stale</span>
                  )}
                  <span className="text-text-tertiary ml-auto">{relativeTime(snap.fetchedAt)}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
