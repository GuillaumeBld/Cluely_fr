import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface NudgePayload {
  message: string;
  meeting_id: string;
  timestamp: number;
}

export function ProactiveNudgeToast() {
  const [nudge, setNudge] = useState<NudgePayload | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.proactiveAdvice) return;
    const cleanup = api.proactiveAdvice.onNudge((data: NudgePayload) => {
      setNudge(data);
    });
    return cleanup;
  }, []);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), 10_000);
    return () => clearTimeout(t);
  }, [nudge]);

  return (
    <AnimatePresence>
      {nudge && (
        <motion.div
          key={nudge.timestamp}
          initial={{ opacity: 0, scale: 0.98, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 4 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ zIndex: 9999 }}
          className="fixed top-4 right-4 max-w-xs w-full"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 rounded-lg bg-gray-900/90 backdrop-blur-sm border border-gray-700 p-3 shadow-lg">
            <span className="mt-0.5 text-indigo-400 shrink-0">&#x1f4a1;</span>
            <p className="text-sm text-gray-100 flex-1">{nudge.message}</p>
            <button
              aria-label="Dismiss"
              onClick={() => setNudge(null)}
              className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
            >
              &#x2715;
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
