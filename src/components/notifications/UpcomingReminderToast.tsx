'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

interface Item { key: string; kind: string; leadId: number; leadName: string; at: string; note: string | null }

const POLL_MS = 60_000;

// Persistent (no auto-dismiss) reminder shown from N minutes before a meeting or follow-up (N is a CEO setting). It
// stays until the person dismisses it; a dismissed item does not come back for that start time.
export default function UpcomingReminderToast() {
  const [items, setItems] = useState<Item[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('dismissed-reminders') || '[]');
      if (Array.isArray(saved)) setDismissed(new Set(saved));
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/reminders/upcoming', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setItems(json.items || []);
      } catch { /* try again next tick */ }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      try { sessionStorage.setItem('dismissed-reminders', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const visible = items.filter((i) => !dismissed.has(`${i.key}@${i.at}`));
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {visible.map((i) => {
        const mins = Math.max(0, Math.round((new Date(i.at).getTime() - Date.now()) / 60000));
        return (
          <div key={i.key} className="rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-lg">
            <div className="flex items-start gap-2">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1 text-sm text-amber-900">
                <p className="font-semibold">{i.kind} {mins <= 0 ? 'starting now' : `in ${mins} min`}</p>
                <a href={`/admin/leads/${i.leadId}/edit`} className="block truncate underline">{i.leadName}</a>
                <p className="text-xs">{new Date(i.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{i.note ? ` · ${i.note}` : ''}</p>
              </div>
              <button onClick={() => dismiss(`${i.key}@${i.at}`)} aria-label="Dismiss reminder" className="text-amber-700 hover:text-amber-900"><X className="h-4 w-4" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
