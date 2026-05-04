import { useState, useEffect } from 'react';

type SpendRow = { provider: string; model: string; inputTokens: number; outputTokens: number; costCents: number };
type SpendData = { totalCents: number; byModel: SpendRow[] };

export function CostDashboard({ meetingId }: { meetingId?: string }) {
  const [sessionSpend, setSessionSpend] = useState<SpendData>({ totalCents: 0, byModel: [] });
  const [dailySpend, setDailySpend] = useState<SpendData>({ totalCents: 0, byModel: [] });
  const [dailyBudget, setDailyBudget] = useState<number | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.cost) return;

    if (meetingId) api.cost.getSessionSpend(meetingId).then(setSessionSpend).catch(console.warn);
    api.cost.getDailySpend().then(setDailySpend).catch(console.warn);
    api.cost.getDailyBudget().then(setDailyBudget).catch(console.warn);

    const cleanup = api.cost.onBudgetExceeded(() => setBudgetExceeded(true));
    return cleanup;
  }, [meetingId]);

  const fmtCents = (c: number) => `$${(c / 100).toFixed(4)}`;

  return (
    <div className="p-4 space-y-4">
      {budgetExceeded && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">
          Daily AI budget exceeded — LLM calls are paused.
        </div>
      )}
      {meetingId && (
        <section>
          <h3 className="font-semibold">Session spend</h3>
          <p className="text-lg">{fmtCents(sessionSpend.totalCents)}</p>
          <ModelTable rows={sessionSpend.byModel} fmtCents={fmtCents} />
        </section>
      )}
      <section>
        <h3 className="font-semibold">Today&apos;s spend</h3>
        <p className="text-lg">{fmtCents(dailySpend.totalCents)}</p>
        {dailyBudget !== null && (
          <p className="text-sm text-gray-500">
            Budget: {fmtCents(dailyBudget)} — {((dailySpend.totalCents / dailyBudget) * 100).toFixed(1)}% used
          </p>
        )}
        <ModelTable rows={dailySpend.byModel} fmtCents={fmtCents} />
      </section>
    </div>
  );
}

function ModelTable({ rows, fmtCents }: { rows: SpendRow[]; fmtCents: (c: number) => string }) {
  if (!rows.length) return <p className="text-sm text-gray-400">No data</p>;
  return (
    <table className="w-full text-sm mt-2">
      <thead><tr><th>Provider</th><th>Model</th><th>In</th><th>Out</th><th>Cost</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.provider}</td><td>{r.model}</td>
            <td>{r.inputTokens.toLocaleString()}</td>
            <td>{r.outputTokens.toLocaleString()}</td>
            <td>{fmtCents(r.costCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
