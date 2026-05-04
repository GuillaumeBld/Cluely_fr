import React, { useEffect, useState } from 'react';
import { Users, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AttendeeRelation {
  predicate: string;
  targetLabel: string;
  targetKind: string;
  weight: number;
  direction: string;
}

interface AttendeeFact {
  key: string;
  value: string;
  confidence: number;
}

interface AttendeeCard {
  speaker: string;
  personNodeId: string;
  relations: AttendeeRelation[];
  facts: AttendeeFact[];
}

export function AttendeePanel() {
  const [attendees, setAttendees] = useState<AttendeeCard[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.attendeeTracker) return;

    api.attendeeTracker.getAll().then((cards: AttendeeCard[]) => {
      if (cards?.length) setAttendees(cards);
    }).catch((err: unknown) => {
      console.warn('[AttendeePanel] Failed to fetch attendees:', err);
    });

    const cleanup = api.attendeeTracker.onAttendeesUpdated(
      (data: { meeting_id: string; attendees: AttendeeCard[] }) => {
        setAttendees(data.attendees);
      }
    );
    return cleanup;
  }, []);

  if (!attendees.length || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="attendee-panel"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mx-4 mt-2 rounded-xl border border-cyan-500/20 bg-cyan-950/20 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <Users size={11} className="text-cyan-400 shrink-0" />
          <span className="text-[9px] font-bold tracking-widest text-cyan-400 uppercase shrink-0">Attendees</span>
          <span className="text-[9px] text-text-tertiary flex-1">{attendees.length} detected</span>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Dismiss"
          >
            <X size={11} />
          </button>
        </div>

        <div className="px-3 pb-2.5 pt-1 space-y-1.5 border-t border-cyan-500/10">
          {attendees.map(card => (
            <div key={card.speaker} className="text-[10px]">
              <span className="font-semibold text-cyan-300/80">{card.speaker}</span>
              {card.relations.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {card.relations.map((r, i) => (
                    <span
                      key={i}
                      className="text-[8px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300/70"
                    >
                      {r.predicate} → {r.targetLabel}
                    </span>
                  ))}
                </div>
              )}
              {card.facts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {card.facts.map((f, i) => (
                    <span
                      key={i}
                      className="text-[8px] text-text-tertiary"
                    >
                      {f.key}: {f.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
