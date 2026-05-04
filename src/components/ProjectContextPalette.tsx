import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ProjectNode {
  id: string;
  kind: string;
  label: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export const ProjectContextPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeProject, setActiveProject] = useState<{ projectId: string | null; label: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending debounce timer on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Load initial active project
  useEffect(() => {
    window.electronAPI?.getActiveProject().then(setActiveProject).catch(err => console.error('[ProjectContextPalette] getActiveProject failed:', err));
  }, []);

  // Listen for palette open trigger from main process
  useEffect(() => {
    const cleanup = window.electronAPI?.onOpenProjectPalette(() => {
      setIsOpen(true);
    });
    return () => cleanup?.();
  }, []);

  // Listen for context changes
  useEffect(() => {
    const cleanup = window.electronAPI?.onProjectContextChanged((data) => {
      setActiveProject(data);
    });
    return () => cleanup?.();
  }, []);

  // Keyboard: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto-focus input when opened; reset state when closed
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      // Fetch full project list on each open so results are always fresh
      fetchProjects('');
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  const fetchProjects = async (q: string) => {
    setLoading(true);
    try {
      const nodes = await window.electronAPI?.listProjects(q || undefined);
      setResults(nodes ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProjects(q), 200);
  }, []);

  const handleSelect = async (node: ProjectNode) => {
    try {
      const result = await window.electronAPI?.switchProject(node.id, node.label);
      if (result && !result.success) throw new Error(result.error ?? 'Switch failed');
      setIsOpen(false);
    } catch (err) {
      console.error('[ProjectContextPalette] switchProject failed:', err);
    }
  };

  const handleClear = async () => {
    try {
      await window.electronAPI?.clearActiveProject();
      setIsOpen(false);
    } catch (err) {
      console.error('[ProjectContextPalette] clearActiveProject failed:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="project-context-palette"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[480px] bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl p-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-300">Switch Project</span>
              {activeProject?.label && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  {activeProject.label}
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Search input */}
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            placeholder="Type a project name..."
            className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-sky-500 placeholder-gray-500"
          />

          {/* Results list */}
          {results.length > 0 && (
            <ul className="mt-2 space-y-0.5 max-h-64 overflow-y-auto">
              {results.map(node => (
                <li
                  key={node.id}
                  onClick={() => handleSelect(node)}
                  className="px-3 py-2.5 rounded-xl hover:bg-white/5 border border-transparent cursor-pointer text-sm text-gray-200 transition-colors"
                >
                  {node.label}
                  {activeProject?.projectId === node.id && (
                    <span className="ml-2 text-xs text-sky-400">(active)</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Empty state */}
          {!loading && query.trim() && results.length === 0 && (
            <p className="mt-2 px-3 py-2 text-sm text-gray-500">No results for &ldquo;{query}&rdquo;</p>
          )}
          {!loading && !query.trim() && results.length === 0 && (
            <p className="mt-2 px-3 py-2 text-sm text-gray-500">No projects found</p>
          )}

          {/* Clear scope button */}
          {activeProject?.projectId && (
            <button
              onClick={handleClear}
              className="mt-2 w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1.5 transition-colors"
            >
              Clear scope (show all projects)
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
