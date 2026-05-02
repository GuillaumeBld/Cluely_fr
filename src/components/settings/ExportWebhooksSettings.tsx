import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import type { ExportWebhook } from '../../types/electron';

export const ExportWebhooksSettings: React.FC = () => {
    const [webhooks, setWebhooks] = useState<ExportWebhook[]>([]);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            const stored = await window.electronAPI?.getExportWebhooks?.();
            if (stored) setWebhooks(stored);
        };
        load();
    }, []);

    const handleAdd = async () => {
        if (!newUrl.trim() || !newName.trim()) return;
        setSaving(true);
        try {
            const webhook: ExportWebhook = {
                id: crypto.randomUUID(),
                url: newUrl.trim(),
                name: newName.trim(),
                createdAt: new Date().toISOString(),
            };
            await window.electronAPI?.saveExportWebhook?.(webhook);
            setWebhooks((prev) => [...prev, webhook]);
            setNewName('');
            setNewUrl('');
        } catch (err) {
            console.error('[ExportWebhooksSettings] Failed to save webhook:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await window.electronAPI?.deleteExportWebhook?.(id);
            setWebhooks((prev) => prev.filter((w) => w.id !== id));
        } catch (err) {
            console.error('[ExportWebhooksSettings] Failed to delete webhook:', err);
        }
    };

    return (
        <div className="space-y-5 animated fadeIn select-text pb-4">
            <div>
                <h3 className="text-lg font-bold text-text-primary mb-1">Export Webhooks</h3>
                <p className="text-xs text-text-secondary">
                    Les URLs de webhook reçoivent un POST avec le payload complet de la tâche après chaque approbation.
                </p>
            </div>

            {webhooks.length > 0 && (
                <div className="space-y-2">
                    {webhooks.map((w) => (
                        <div
                            key={w.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-bg-subtle/50 border border-border-subtle"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text-primary truncate">{w.name}</p>
                                <p className="text-xs text-text-secondary truncate">{w.url}</p>
                            </div>
                            <button
                                onClick={() => handleDelete(w.id)}
                                className="ml-3 p-1.5 rounded-md text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {webhooks.length === 0 && (
                <p className="text-xs text-text-tertiary italic">Aucun webhook configuré.</p>
            )}

            <div className="space-y-2 pt-2 border-t border-border-subtle">
                <h4 className="text-sm font-medium text-text-primary">Ajouter un webhook</h4>
                <input
                    placeholder="Nom (ex: Mon Zap Zapier)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-subtle border border-border-subtle text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary/50"
                />
                <input
                    placeholder="https://hooks.example.com/..."
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-subtle border border-border-subtle text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary/50"
                />
                <button
                    onClick={handleAdd}
                    disabled={saving || !newName.trim() || !newUrl.trim()}
                    className="px-4 py-2 rounded-lg bg-accent-primary text-white text-sm font-medium hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {saving ? 'Enregistrement...' : 'Ajouter le webhook'}
                </button>
            </div>
        </div>
    );
};
