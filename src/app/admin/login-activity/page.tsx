'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface LogRow {
  id: number;
  employee_name: string | null;
  username: string | null;
  role_name: string | null;
  event: string;
  success: number;
  ip_address: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  reason: string | null;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  login_failed: 'Failed sign-in',
  blocked_network: 'Blocked (not office network)',
};

const PAGE_SIZE = 50;

// Admin report: who signed in to the CRM, from which device and network, and when.
export default function LoginActivityPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [event, setEvent] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (event) params.set('event', event);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/login-activity?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load login activity');
      setRows(json.rows);
      setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load login activity');
    } finally {
      setLoading(false);
    }
  }, [page, from, to, event, search]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const field = 'rounded-md border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Login Activity</h1>
          <p className="text-sm text-slate-500">Who signed in to the CRM, from which device and network, and when.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={field} aria-label="From date" />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={field} aria-label="To date" />
        <select value={event} onChange={(e) => { setEvent(e.target.value); setPage(1); }} className={field} aria-label="Event">
          <option value="">All events</option>
          {Object.entries(EVENT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input type="search" placeholder="Search name, username or IP" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${field} min-w-[16rem]`} />
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              {['When', 'Employee', 'Role', 'Event', 'Device', 'Browser / OS', 'IP address', 'Note'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No login activity for these filters.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2">{r.employee_name || r.username || 'Unknown'}</td>
                <td className="px-4 py-2">{r.role_name || '-'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{EVENT_LABEL[r.event] || r.event}</span>
                </td>
                <td className="px-4 py-2">{r.device_type || '-'}</td>
                <td className="px-4 py-2">{[r.browser, r.os].filter(Boolean).join(' / ') || '-'}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.ip_address || '-'}</td>
                <td className="px-4 py-2 text-slate-500">{r.reason || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{total} record{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">Previous</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
