import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AttendeeProfile {
  email: string;
  recentEmails: Array<{ subject: string; sender: string; date: string; snippet: string; mailbox: string }>;
  openItems: string[];
  priorDecisions: string[];
}

interface PreBrief {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  projectId: string | null;
  templateId: string;
  attendees: AttendeeProfile[];
  firedAt: number;
}

export function PreBriefBanner() {
  const [brief, setBrief] = useState<PreBrief | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.preMeeting) return;

    api.preMeeting.getLastBrief().then((b: PreBrief | null) => {
      if (b) setBrief(b);
    }).catch(() => { /* brief unavailable, banner stays hidden */ });

    const cleanup = api.preMeeting.onBriefReady((b: PreBrief) => setBrief(b));
    return cleanup;
  }, []);

  if (!brief) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mx-4 mt-3 rounded-xl border border-violet-500/20 bg-violet-950/20 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-[9px] font-bold tracking-widest text-violet-400 uppercase shrink-0">Brief</span>
          <span className="text-[11px] text-text-primary font-medium flex-1 truncate">{brief.eventTitle}</span>
          <span className="text-[9px] text-text-tertiary bg-white/5 px-1.5 py-0.5 rounded-full">{brief.templateId}</span>
          <button
            onClick={() => setBrief(null)}
            className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Dismiss"
          >
            <X size={11} />
          </button>
        </div>

        {brief.attendees.length > 0 && (
          <div className="px-3 pb-2.5 pt-1 space-y-1.5 border-t border-violet-500/10">
            {brief.attendees.map(a => (
              <div key={a.email} className="text-[10px]">
                <span className="font-semibold text-violet-300/80">{a.email}</span>
                {a.recentEmails[0] && (
                  <p className="text-text-tertiary mt-0.5 truncate">{a.recentEmails[0].subject}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
