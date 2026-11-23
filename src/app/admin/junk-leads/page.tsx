'use client';

import { useCallback, useEffect, useState } from 'react';

interface JunkLead {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  last_updated: string | null;
  counselor_name: string | null;
  closed_by_name: string | null;
  branch_name: string | null;
}

const PAGE_SIZE = 50;

// Leads a counselor marked Junk. Marking a lead Junk closes it, so it drops out of the working lists and lands here.
export default function JunkLeadsPage() {
  const [rows, setRows] = useState<JunkLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (search.trim()) p.set('search', search.trim());
      const res = await fetch(`/api/admin/junk-leads?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load junk leads');
      setRows(json.rows);
      setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load junk leads');
    } finally {
      setLoading(false);
    }
  }, [page, from, to, search]);
  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const field = 'rounded-md border border-slate-300 px-3 py-2 text-sm';
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Junk Leads</h1>
        <p className="text-sm text-slate-500">Leads marked Junk are closed. To work one again, change its status from the lead page.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={field} aria-label="From date" />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={field} aria-label="To date" />
        <input type="search" placeholder="Search name, phone or e-mail" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${field} min-w-[16rem]`} />
      </div>
      {error && <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>{['Lead', 'Phone', 'E-mail', 'Branch', 'Counselor', 'Closed by', 'Closed on', 'Reason'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No junk leads.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2"><a className="text-blue-600 underline" href={`/admin/leads/${r.id}/edit`}>{r.name || `Lead #${r.id}`}</a></td>
                <td className="px-4 py-2">{r.phone || '-'}</td>
                <td className="px-4 py-2">{r.email || '-'}</td>
                <td className="px-4 py-2">{r.branch_name || '-'}</td>
                <td className="px-4 py-2">{r.counselor_name || '-'}</td>
                <td className="px-4 py-2">{r.closed_by_name || '-'}</td>
                <td className="whitespace-nowrap px-4 py-2">{(r.closed_at || r.last_updated) ? new Date((r.closed_at || r.last_updated) as string).toLocaleDateString() : '-'}</td>
                <td className="px-4 py-2 text-slate-500">{r.closed_reason || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{total} junk lead{total === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">Previous</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
