import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  turn_id: string;
  speaker: string;
  text: string;
  timestamp: number;
  meeting_id: string;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export const TranscriptSearchOverlay: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      const hits = await window.electronAPI?.searchTranscript(q);
      setResults((hits ?? []).slice(0, 20));
    }, 200);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="transcript-search"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[480px] bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl p-3"
        >
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            placeholder="Search transcript…"
            className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500 placeholder-gray-500"
          />
          {results.length > 0 && (
            <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto">
              {results.map(turn => (
                <li key={turn.turn_id} className="px-3 py-2 rounded-lg hover:bg-gray-800 text-sm">
                  <span className="text-indigo-400 font-medium">{turn.speaker}</span>
                  <span className="text-gray-500 mx-1">&bull;</span>
                  <span className="text-gray-400">{formatTimestamp(turn.timestamp)}</span>
                  <span className="text-gray-500 mx-1">&bull;</span>
                  <span className="text-gray-200">{turn.text}</span>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && results.length === 0 && (
            <p className="mt-2 px-3 py-2 text-sm text-gray-500">No results</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
