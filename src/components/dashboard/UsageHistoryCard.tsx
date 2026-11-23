'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Usage { todaySeconds: number; weekSeconds: number; monthSeconds: number; daily: Array<{ date: string; seconds: number }> }

const fmt = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// "How much time have I spent in the CRM" - today / last 7 days / this month, plus the last 14 days.
export default function UsageHistoryCard() {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    fetch('/api/usage', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(setUsage).catch(() => setUsage(null));
  }, []);
  if (!usage) return null;
  const max = Math.max(1, ...usage.daily.map((d) => d.seconds));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock className="h-4 w-4" /> My CRM Usage</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        {([['Today', usage.todaySeconds], ['Last 7 days', usage.weekSeconds], ['This month', usage.monthSeconds]] as const).map(([label, s]) => (
          <div key={label}><p className="text-lg font-bold text-slate-900">{fmt(s)}</p><p className="text-xs text-slate-500">{label}</p></div>
        ))}
      </div>
      <div className="mt-4 flex h-12 items-end gap-1" aria-label="Daily usage, last 14 days">
        {usage.daily.map((d) => (
          <div key={d.date} title={`${d.date}: ${fmt(d.seconds)}`} className="flex-1 rounded-t bg-blue-500/70" style={{ height: `${Math.max(4, (d.seconds / max) * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}
