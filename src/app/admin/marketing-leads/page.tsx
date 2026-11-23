'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Loader2, Search, X } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend);

// Leads Quality report for the Marketing login: the CRM version of the legacy leads-dashboard.php.
// Seven tabs (lead quality, current/all retention by source, program and counsellor) and two pie charts,
// filtered by date range and branch. Everything comes from /api/admin/marketing-leads-dashboard.

interface QualityRow { sourceId: number | null; name: string; counts: Record<string, number>; total: number }
interface RetentionRow { id: number | null; name: string; retention: number; packageAmount: number; paidAmount: number }
interface RetentionSet { bySource: RetentionRow[]; byProgram: RetentionRow[]; byCounsellor: RetentionRow[] }
interface DashboardData {
  range: { sdate: string; edate: string };
  branches: Array<{ id: number; name: string }>;
  quality: { columns: string[]; rows: QualityRow[]; totals: Record<string, number> };
  currentRetention: RetentionSet;
  allRetention: RetentionSet;
  charts: { sources: Array<{ name: string; count: number }>; statuses: Array<{ name: string; count: number }> };
}
interface DetailLead { id: number; name: string; status: string | null; regdate: string | null; counsellor: string | null; branch: string | null; retained: number }

type Cell = string | number;
interface Column { key: string; label: string; numeric?: boolean }
type Row = Record<string, Cell | null | undefined> & { __sourceId?: number | null };

const PALETTE = ['#9A6A2B', '#C9964A', '#6B4518', '#E6C078', '#B8873A', '#4A2F10', '#D9B26A', '#7A5424', '#8F8470', '#A99C86', '#2F7D5B', '#B3261E'];

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const formatDmy = (iso: string) => (iso ? iso.split('-').reverse().join('-') : '');
const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TABS = [
  { key: 'quality', label: 'Lead Quality' },
  { key: 'curSource', label: 'Current Lead Retention' },
  { key: 'curProgram', label: 'Current Program Retention' },
  { key: 'curCounsellor', label: 'Counsellor Retention' },
  { key: 'allSource', label: 'All Retention' },
  { key: 'allProgram', label: 'All Program Retention' },
  { key: 'allCounsellor', label: 'All Counsellor Retention' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

async function downloadExcel(filename: string, columns: Column[], rows: Row[], totals: Row | null) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Leads');
  sheet.addRow(columns.map((c) => c.label)).font = { bold: true };
  for (const row of rows) sheet.addRow(columns.map((c) => row[c.key]));
  if (totals) sheet.addRow(columns.map((c) => totals[c.key])).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 22; });
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Table with the legacy DataTables behaviour: search box, page length (default All), sortable headers, totals footer, Excel export.
function ReportTable({ title, columns, rows, totals, onSourceClick }: {
  title: string;
  columns: Column[];
  rows: Row[];
  totals: Row | null;
  onSourceClick?: (row: Row) => void;
}) {
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<number>(-1);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = needle ? rows.filter((row) => columns.some((c) => String(row[c.key] ?? '').toLowerCase().includes(needle))) : rows;
    if (!sort) return matching;
    return [...matching].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, columns, search, sort]);

  const pageCount = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = pageSize === -1 ? filtered : filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setSort((current) => (current?.key === key ? (current.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--cmg-muted)]">
          <label className="flex items-center gap-2">
            Show
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="rounded-md border border-[var(--cmg-border)] bg-[var(--cmg-surface)] px-2 py-1 text-[var(--cmg-ink)]"
            >
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={-1}>All</option>
            </select>
            entries
          </label>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try { await downloadExcel(`${title.replace(/\s+/g, '-').toLowerCase()}.xlsx`, columns, filtered, totals); } finally { setExporting(false); }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--cmg-border)] bg-[var(--cmg-surface)] px-3 py-1.5 font-medium text-[var(--cmg-ink)] transition hover:border-[var(--cmg-blue)] hover:text-[var(--cmg-blue)] disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            Excel
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--cmg-muted)]">
          Search:
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="rounded-md border border-[var(--cmg-border)] bg-[var(--cmg-surface)] px-3 py-1.5 text-[var(--cmg-ink)] outline-none focus:border-[var(--cmg-blue)] focus:ring-2 focus:ring-[var(--cmg-blue)]/25"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--cmg-border)]">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--cmg-blue-soft)] text-left">
              {columns.map((c) => (
                <th key={c.key} className={`border-b border-[var(--cmg-border)] px-3 py-2.5 font-semibold text-[var(--cmg-ink)] ${c.numeric ? 'text-right' : ''}`}>
                  <button type="button" onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-1 ${c.numeric ? 'flex-row-reverse' : ''}`}>
                    {c.label}
                    {sort?.key === c.key
                      ? (sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />)
                      : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-[var(--cmg-muted)]">No leads in this period</td></tr>
            ) : visible.map((row, index) => (
              <tr key={`${row[columns[0].key]}-${index}`} className={index % 2 ? 'bg-[var(--cmg-blue-soft)]/40' : ''}>
                {columns.map((c, ci) => (
                  <td key={c.key} className={`border-b border-[var(--cmg-border)] px-3 py-2 text-[var(--cmg-ink)] ${c.numeric ? 'text-right tabular-nums' : ''}`}>
                    {ci === 0 && onSourceClick && row.__sourceId ? (
                      <button type="button" onClick={() => onSourceClick(row)} className="rounded-md bg-[var(--cmg-blue)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[var(--cmg-blue-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmg-blue)]/50">
                        {row[c.key]}
                      </button>
                    ) : c.numeric && typeof row[c.key] === 'number' && c.key.toLowerCase().includes('amount') ? money(row[c.key] as number) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="bg-[var(--cmg-blue-soft)] font-bold">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2.5 text-[var(--cmg-ink)] ${c.numeric ? 'text-right tabular-nums' : ''}`}>
                    {c.numeric && typeof totals[c.key] === 'number' && c.key.toLowerCase().includes('amount') ? money(totals[c.key] as number) : totals[c.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--cmg-muted)]">
        <span>Showing {visible.length === 0 ? 0 : (pageSize === -1 ? 1 : safePage * pageSize + 1)} to {pageSize === -1 ? filtered.length : Math.min(filtered.length, safePage * pageSize + pageSize)} of {filtered.length} entries</span>
        {pageSize !== -1 && pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded-md border border-[var(--cmg-border)] px-3 py-1 disabled:opacity-40">Previous</button>
            <span>Page {safePage + 1} of {pageCount}</span>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="rounded-md border border-[var(--cmg-border)] px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

function PieCard({ title, slices }: { title: string; slices: Array<{ name: string; count: number }> }) {
  const data = {
    labels: slices.map((s) => s.name),
    datasets: [{ label: title, data: slices.map((s) => s.count), backgroundColor: slices.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: 'rgba(255,255,255,0.8)', borderWidth: 1 }],
  };
  return (
    <section className="rounded-2xl border border-[var(--cmg-border)] bg-[var(--cmg-surface)] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-[var(--cmg-ink)]">{title}</h3>
      {slices.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--cmg-muted)]">No leads in this period</p>
      ) : (
        <div className="mx-auto max-w-[420px]"><Pie data={data} options={{ plugins: { legend: { position: 'bottom' } } }} /></div>
      )}
    </section>
  );
}

function retentionColumns(label: string, withAmounts: boolean): Column[] {
  return [
    { key: 'name', label },
    { key: 'retention', label: 'Retention', numeric: true },
    ...(withAmounts ? [{ key: 'packageAmount', label: 'Package Amount', numeric: true }, { key: 'paidAmount', label: 'Paid Amount', numeric: true }] : []),
  ];
}

function retentionRows(rows: RetentionRow[]): Row[] {
  return rows.map((r) => ({ name: r.name, retention: r.retention, packageAmount: r.packageAmount, paidAmount: r.paidAmount }));
}

function sumRow(rows: RetentionRow[], withAmounts: boolean): Row {
  return {
    name: 'Total',
    retention: rows.reduce((s, r) => s + r.retention, 0),
    ...(withAmounts ? { packageAmount: rows.reduce((s, r) => s + r.packageAmount, 0), paidAmount: rows.reduce((s, r) => s + r.paidAmount, 0) } : {}),
  };
}

export default function MarketingLeadsDashboard() {
  const [sdate, setSdate] = useState(todayIso());
  const [edate, setEdate] = useState(todayIso());
  const [branch, setBranch] = useState('');
  const [applied, setApplied] = useState({ sdate: todayIso(), edate: todayIso(), branch: '' });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('quality');
  const [detail, setDetail] = useState<{ source: string; leads: DetailLead[] | null } | null>(null);

  const load = useCallback(async (filters: { sdate: string; edate: string; branch: string }) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ sdate: filters.sdate, edate: filters.edate });
      if (filters.branch) params.set('branch', filters.branch);
      const res = await fetch(`/api/admin/marketing-leads-dashboard?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load the leads dashboard');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the leads dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(applied); }, [applied, load]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (edate < sdate) { setError('End date cannot be before the start date'); return; }
    setApplied({ sdate, edate, branch });
  };

  const openSource = async (row: Row) => {
    const sourceId = row.__sourceId;
    if (!sourceId) return;
    setDetail({ source: String(row.name), leads: null });
    try {
      const params = new URLSearchParams({ sdate: applied.sdate, edate: applied.edate, sourceId: String(sourceId) });
      if (applied.branch) params.set('branch', applied.branch);
      const res = await fetch(`/api/admin/marketing-leads-dashboard?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load leads');
      setDetail({ source: String(row.name), leads: json.leads || [] });
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    }
  };

  const withAmounts = Boolean(applied.branch);

  const table = useMemo(() => {
    if (!data) return null;
    const q = data.quality;
    const qualityColumns: Column[] = [{ key: 'name', label: 'Sources' }, ...q.columns.map((c) => ({ key: c, label: c, numeric: true })), { key: 'total', label: 'Total', numeric: true }];
    const sets: Record<Exclude<TabKey, 'quality'>, { title: string; columns: Column[]; rows: Row[]; totals: Row }> = {
      curSource: { title: 'Current Lead Retention', columns: retentionColumns('Sources', withAmounts), rows: retentionRows(data.currentRetention.bySource), totals: sumRow(data.currentRetention.bySource, withAmounts) },
      curProgram: { title: 'Current Program Retention', columns: retentionColumns('Program', withAmounts), rows: retentionRows(data.currentRetention.byProgram), totals: sumRow(data.currentRetention.byProgram, withAmounts) },
      curCounsellor: { title: 'Counsellor Retention', columns: retentionColumns('Counsellor', false), rows: retentionRows(data.currentRetention.byCounsellor), totals: sumRow(data.currentRetention.byCounsellor, false) },
      allSource: { title: 'All Retention', columns: retentionColumns('Sources', withAmounts), rows: retentionRows(data.allRetention.bySource), totals: sumRow(data.allRetention.bySource, withAmounts) },
      allProgram: { title: 'All Program Retention', columns: retentionColumns('Program', false), rows: retentionRows(data.allRetention.byProgram), totals: sumRow(data.allRetention.byProgram, false) },
      allCounsellor: { title: 'All Counsellor Retention', columns: retentionColumns('Counsellor', false), rows: retentionRows(data.allRetention.byCounsellor), totals: sumRow(data.allRetention.byCounsellor, false) },
    };
    return {
      quality: {
        title: 'Lead Quality',
        columns: qualityColumns,
        rows: q.rows.map((r): Row => ({ name: r.name, ...r.counts, total: r.total, __sourceId: r.sourceId })),
        totals: { name: 'Total', ...q.totals, total: Object.values(q.totals).reduce((s, n) => s + n, 0) } as Row,
      },
      ...sets,
    };
  }, [data, withAmounts]);

  const active = table ? table[tab] : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--cmg-ink)]">Leads Quality report</h1>
        <p className="mt-1 text-sm text-[var(--cmg-muted)]">
          {formatDmy(applied.sdate)} to {formatDmy(applied.edate)}{applied.branch && data ? ` · ${data.branches.find((b) => String(b.id) === applied.branch)?.name || ''}` : ' · All branches'}
        </p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-4 rounded-2xl border border-[var(--cmg-border)] bg-[var(--cmg-surface)] p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
        <label className="block text-sm font-medium text-[var(--cmg-ink)]">
          Start Date
          <input type="date" value={sdate} max={edate || undefined} onChange={(e) => setSdate(e.target.value)} required className="mt-1.5 w-full rounded-lg border border-[var(--cmg-border)] bg-[var(--cmg-surface)] px-3 py-2 text-[var(--cmg-ink)] outline-none focus:border-[var(--cmg-blue)] focus:ring-2 focus:ring-[var(--cmg-blue)]/25" />
        </label>
        <label className="block text-sm font-medium text-[var(--cmg-ink)]">
          End Date
          <input type="date" value={edate} min={sdate || undefined} onChange={(e) => setEdate(e.target.value)} required className="mt-1.5 w-full rounded-lg border border-[var(--cmg-border)] bg-[var(--cmg-surface)] px-3 py-2 text-[var(--cmg-ink)] outline-none focus:border-[var(--cmg-blue)] focus:ring-2 focus:ring-[var(--cmg-blue)]/25" />
        </label>
        <label className="block text-sm font-medium text-[var(--cmg-ink)]">
          Branch
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--cmg-border)] bg-[var(--cmg-surface)] px-3 py-2 text-[var(--cmg-ink)] outline-none focus:border-[var(--cmg-blue)] focus:ring-2 focus:ring-[var(--cmg-blue)]/25">
            <option value="">Select</option>
            {(data?.branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <button type="submit" disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--cmg-blue)] px-6 text-sm font-semibold text-white transition hover:bg-[var(--cmg-blue-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmg-blue)]/50 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          Search
        </button>
      </form>

      {error && <div role="alert" className="rounded-xl border border-[#F2B8B0] bg-[#FDECEA] px-4 py-3 text-sm text-[#B0241E]">{error}</div>}

      <div className="rounded-2xl border border-[var(--cmg-border)] bg-[var(--cmg-surface)] shadow-sm">
        <div role="tablist" aria-label="Report" className="flex flex-wrap gap-1 border-b border-[var(--cmg-border)] px-3 pt-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${tab === t.key ? 'border border-b-0 border-[var(--cmg-border)] bg-[var(--cmg-surface)] text-[var(--cmg-blue)]' : 'text-[var(--cmg-muted)] hover:text-[var(--cmg-ink)]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4 sm:p-5">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[var(--cmg-muted)]"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading</div>
          ) : active ? (
            <ReportTable
              key={`${tab}-${applied.sdate}-${applied.edate}-${applied.branch}`}
              title={active.title}
              columns={active.columns}
              rows={active.rows}
              totals={active.totals}
              onSourceClick={tab === 'quality' ? openSource : undefined}
            />
          ) : null}
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PieCard title="Leads by source (not yet paid)" slices={data.charts.sources} />
          <PieCard title="Leads by status (not yet paid)" slices={data.charts.statuses} />
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`Leads from ${detail.source}`} onClick={() => setDetail(null)}>
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--cmg-border)] bg-[var(--cmg-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--cmg-border)] px-5 py-4">
              <h2 className="font-semibold text-[var(--cmg-ink)]">{detail.source} · {formatDmy(applied.sdate)} to {formatDmy(applied.edate)}</h2>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close" className="rounded-md p-1 text-[var(--cmg-muted)] hover:text-[var(--cmg-ink)]"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="overflow-auto p-5">
              {detail.leads === null ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[var(--cmg-muted)]"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading</div>
              ) : (
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-[var(--cmg-blue-soft)] text-left">
                      {['Lead', 'Name', 'Status', 'Registered', 'Counsellor', 'Branch', 'Paid'].map((h) => <th key={h} className="border-b border-[var(--cmg-border)] px-3 py-2 font-semibold text-[var(--cmg-ink)]">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.leads.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--cmg-muted)]">No leads</td></tr>
                    ) : detail.leads.map((lead) => (
                      <tr key={lead.id}>
                        <td className="border-b border-[var(--cmg-border)] px-3 py-2 tabular-nums text-[var(--cmg-ink)]">#{lead.id}</td>
                        <td className="border-b border-[var(--cmg-border)] px-3 py-2 text-[var(--cmg-ink)]">{lead.name || '—'}</td>
                        <td className="border-b border-[var(--cmg-border)] px-3 py-2 text-[var(--cmg-ink)]">{lead.status || 'Untouched'}</td>
                        <td className="border-b border-[var(--cmg-border)] px-3 py-2 text-[var(--cmg-ink)]">{lead.regdate ? formatDmy(lead.regdate) : '—'}</td>
                        <td className="border-b border-[var(--cmg-border)] px-3 py-2 text-[var(--cmg-ink)]">{lead.counsellor || '—'}</td>
                        <td className="border-b border-[var(--cmg-border)] px-3 py-2 text-[var(--cmg-ink)]">{lead.branch || '—'}</td>
                        <td className="border-b border-[var(--cmg-border)] px-3 py-2 text-[var(--cmg-ink)]">{lead.retained ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
