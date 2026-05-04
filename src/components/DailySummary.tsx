import { useEffect, useState } from 'react';

interface DailySummaryResult {
  date: string;
  meetingsCount: number;
  generatedAt: string;
  overview: string;
  keyDecisions: string[];
  openActionItems: Array<{ text: string; meetingTitle: string; speaker?: string }>;
  themes: string[];
}

interface DailySummaryProps {
  onClose?: () => void;
}

export function DailySummary({ onClose }: DailySummaryProps) {
  const [summary, setSummary] = useState<DailySummaryResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.dailySummary) return;

    api.dailySummary.get().then((s: DailySummaryResult | null) => {
      if (s) setSummary(s);
    }).catch((err: unknown) => {
      console.warn('[DailySummary] Failed to fetch:', err);
    });

    const cleanup = api.dailySummary.onReady((s: DailySummaryResult) => {
      setSummary(s);
      setLoading(false);
    });
    return cleanup;
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const api = (window as any).electronAPI;
      const result = await api?.dailySummary?.generate();
      if (result) setSummary(result);
    } catch (err) {
      console.error('[DailySummary] Generate failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!summary) {
    return (
      <div className="daily-summary daily-summary--empty p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-primary">
            Résumé du jour
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary text-xs"
            >
              ×
            </button>
          )}
        </div>
        <p className="text-xs text-text-secondary mb-3">
          {loading ? 'Génération en cours...' : 'Aucun résumé disponible pour aujourd\'hui.'}
        </p>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
        >
          {loading ? 'Génération...' : 'Générer le résumé'}
        </button>
      </div>
    );
  }

  return (
    <div className="daily-summary p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary">
          Résumé du jour — {summary.date}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-tertiary">
            {summary.meetingsCount} réunion{summary.meetingsCount > 1 ? 's' : ''}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary text-xs"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Vue d'ensemble */}
      <section className="mb-3">
        <h4 className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-1">
          Vue d'ensemble
        </h4>
        <p className="text-xs text-text-secondary leading-relaxed">
          {summary.overview}
        </p>
      </section>

      {/* Décisions clés */}
      {summary.keyDecisions.length > 0 && (
        <section className="mb-3">
          <h4 className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-1">
            Décisions clés
          </h4>
          <ul className="space-y-0.5">
            {summary.keyDecisions.map((d, i) => (
              <li key={i} className="text-xs text-text-secondary flex gap-1.5">
                <span className="text-violet-400 shrink-0">•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actions ouvertes */}
      {summary.openActionItems.length > 0 && (
        <section className="mb-3">
          <h4 className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
            Actions ouvertes
          </h4>
          <ul className="space-y-0.5">
            {summary.openActionItems.map((item, i) => (
              <li key={i} className="text-xs text-text-secondary flex gap-1.5">
                <span className="text-amber-400 shrink-0">○</span>
                <span>
                  {item.text}
                  <span className="text-text-tertiary ml-1">
                    — {item.meetingTitle}
                    {item.speaker && ` (${item.speaker})`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Thèmes émergents */}
      {summary.themes.length > 0 && (
        <section className="mb-2">
          <h4 className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            Thèmes émergents
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {summary.themes.map((t, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Regenerate button */}
      <div className="mt-3 pt-2 border-t border-white/5">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="text-[10px] text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50"
        >
          {loading ? 'Régénération...' : 'Régénérer'}
        </button>
      </div>
    </div>
  );
}
