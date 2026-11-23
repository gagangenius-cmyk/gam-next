'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flag } from 'lucide-react';

interface FlagState { flagged: boolean; reason: string | null; byName: string | null; at: string | null }

// Raise / clear a red flag on a lead. Raising needs a reason; clearing is limited to FOE / Branch Manager / CEO
// (the API enforces it; canClear only hides the button for everyone else).
export default function RedFlagPanel({ leadId, canClear }: { leadId: number | string; canClear: boolean }) {
  const [state, setState] = useState<FlagState | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/red-flag`, { cache: 'no-store' });
      if (res.ok) setState(await res.json());
    } catch { /* leave the panel hidden */ }
  }, [leadId]);
  useEffect(() => { load(); }, [load]);

  const submit = async (flagged: boolean) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/leads/${leadId}/red-flag`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flagged, reason }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not update the red flag');
      setState(json);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the red flag');
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  return (
    <div className={`mb-6 rounded-lg border p-4 ${state.flagged ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flag className={`h-5 w-5 ${state.flagged ? 'fill-red-600 text-red-600' : 'text-gray-400'}`} />
          <div>
            <p className="text-sm font-semibold text-gray-900">{state.flagged ? 'Red flag raised' : 'No red flag'}</p>
            {state.flagged && <p className="text-sm text-red-700">{state.reason}{state.byName ? ` — ${state.byName}` : ''}{state.at ? `, ${new Date(state.at).toLocaleDateString()}` : ''}</p>}
          </div>
        </div>
        {state.flagged && canClear && (
          <button type="button" disabled={busy} onClick={() => submit(false)} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">Clear flag</button>
        )}
      </div>
      {!state.flagged && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does this lead need attention? (required)" className="min-w-[16rem] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <button type="button" disabled={busy || !reason.trim()} onClick={() => submit(true)} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Raise red flag</button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
