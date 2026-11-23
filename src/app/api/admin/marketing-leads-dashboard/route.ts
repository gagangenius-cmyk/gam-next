import { NextRequest, NextResponse } from 'next/server';
import { QueryTypes } from 'sequelize';
import { requireAuth, isAuthError } from '@/lib/apiAuth';
import { sequelize } from '@/lib/sequelize';

// Marketing "Leads Quality report" (the CRM version of the legacy leads-dashboard.php): lead quality by source,
// retention by source / program / counsellor, and the two pie charts. The only data the Marketing login can see.
export const dynamic = 'force-dynamic';

const PERMISSION = 'marketing.leads_dashboard';

const dubaiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isIsoDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const normalizeStatus = (value: unknown) => String(value ?? '').toLowerCase().replace(/[_\s-]+/g, ' ').trim();

interface CountRow { id: number | null; name: string | null; n: number }
interface QualityRow { sid: number | null; name: string | null; st: string | null; n: number }
interface RetentionRow { id: number | null; name: string | null; retention: number; packageAmount: number | null; paidAmount: number | null }

export async function GET(request: NextRequest) {
  const auth = requireAuth(request, [PERMISSION]);
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const today = dubaiToday();
    const sdateParam = searchParams.get('sdate');
    const edateParam = searchParams.get('edate');
    const sdate = isIsoDate(sdateParam) ? sdateParam : today;
    const edate = isIsoDate(edateParam) ? edateParam : sdate;
    if (edate < sdate) {
      return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 });
    }
    const branchRaw = searchParams.get('branch');
    const branch = branchRaw && /^\d+$/.test(branchRaw) ? Number(branchRaw) : null;
    const sourceRaw = searchParams.get('sourceId');
    const sourceId = sourceRaw && /^\d+$/.test(sourceRaw) ? Number(sourceRaw) : null;

    const branchSql = branch ? ' AND l.branch = :branch' : '';
    const replacements = { sdate, edate, branch };
    const run = <T extends object>(sql: string) => sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });

    const regdateRange = 'l.regdate BETWEEN :sdate AND :edate';
    const feeRange = 'l.feeAgreeDate BETWEEN :sdate AND :edate';
    const sourceJoin = `LEFT JOIN crm_source s ON s.id = CAST(NULLIF(l.market_source, '') AS UNSIGNED)`;
    const serviceJoin = `LEFT JOIN crm_service sv ON sv.id = CAST(NULLIF(l.service_interest, '') AS UNSIGNED)`;
    const counsellorJoin = `LEFT JOIN crm_employee e ON e.id = l.Counsilor`;

    // Drill-down: the leads behind one source's row (names only - marketing does not need contact details).
    if (sourceId) {
      const leads = await run<{ id: number; name: string; status: string | null; regdate: string | null; counsellor: string | null; branch: string | null; retained: number }>(`
        SELECT l.id, TRIM(CONCAT_WS(' ', l.fname, l.lname)) AS name, l.status, DATE_FORMAT(l.regdate, '%Y-%m-%d') AS regdate,
               e.name AS counsellor, b.name AS branch, (l.paidYet <> 0) AS retained
          FROM crm_forum_leads l
          ${counsellorJoin}
          LEFT JOIN crm_branch b ON b.id = l.branch
         WHERE ${regdateRange}${branchSql} AND CAST(NULLIF(l.market_source, '') AS UNSIGNED) = ${sourceId}
         ORDER BY l.id DESC
         LIMIT 1000`);
      return NextResponse.json({ range: { sdate, edate }, leads });
    }

    const [statusRows, branches] = await Promise.all([
      sequelize.query<{ name: string }>('SELECT name FROM crm_lead_status WHERE is_enabled = 1 ORDER BY sort_order, id', { type: QueryTypes.SELECT }),
      sequelize.query<{ id: number; name: string }>('SELECT id, name FROM crm_branch WHERE status = 1 ORDER BY name', { type: QueryTypes.SELECT }),
    ]);
    const statusColumns = statusRows.map((row) => row.name);
    const columnByNormalized = new Map(statusColumns.map((name) => [normalizeStatus(name), name]));

    // Lead Quality: source x status. Columns come from crm_lead_status, so a status added in the CRM shows up here.
    const qualityRaw = await run<QualityRow>(`
      SELECT s.id AS sid, s.name AS name, LOWER(TRIM(COALESCE(l.status, ''))) AS st, COUNT(*) AS n
        FROM crm_forum_leads l ${sourceJoin}
       WHERE ${regdateRange}${branchSql}
       GROUP BY s.id, s.name, st`);

    const columns = [...statusColumns, 'Untouched', 'Other'];
    const bySource = new Map<string, { sourceId: number | null; name: string; counts: Record<string, number>; total: number }>();
    for (const row of qualityRaw) {
      const key = String(row.sid ?? 'none');
      let entry = bySource.get(key);
      if (!entry) {
        entry = { sourceId: row.sid, name: row.name || 'Unknown source', counts: Object.fromEntries(columns.map((c) => [c, 0])), total: 0 };
        bySource.set(key, entry);
      }
      const normalized = normalizeStatus(row.st);
      const column = columnByNormalized.get(normalized)
        ?? (normalized === '' || normalized === 'untouched' || normalized === 'untouch' ? 'Untouched' : 'Other');
      const n = Number(row.n);
      entry.counts[column] += n;
      entry.total += n;
    }
    const qualityRows = [...bySource.values()].sort((a, b) => b.total - a.total);
    const qualityTotals: Record<string, number> = Object.fromEntries(columns.map((c) => [c, qualityRows.reduce((sum, r) => sum + r.counts[c], 0)]));

    // Retention = leads that have paid something. "Current" is by registration date, "All" by agreement date.
    const retention = async (dimension: 'source' | 'service' | 'counsellor', range: string): Promise<RetentionRow[]> => {
      const spec = {
        source: { join: sourceJoin, id: 's.id', name: 's.name' },
        service: { join: serviceJoin, id: 'sv.id', name: 'sv.name' },
        counsellor: { join: counsellorJoin, id: 'e.id', name: 'e.name' },
      }[dimension];
      const rows = await run<RetentionRow>(`
        SELECT ${spec.id} AS id, ${spec.name} AS name,
               SUM(CASE WHEN l.paidYet <> 0 THEN 1 ELSE 0 END) AS retention,
               SUM(l.payTotal) AS packageAmount, SUM(l.paidYet) AS paidAmount
          FROM crm_forum_leads l ${spec.join}
         WHERE ${range}${branchSql} AND ${spec.id} IS NOT NULL
         GROUP BY ${spec.id}, ${spec.name}
         ORDER BY retention DESC, name`);
      return rows.map((row) => ({
        id: row.id,
        name: row.name || 'Unknown',
        retention: Number(row.retention || 0),
        packageAmount: Number(row.packageAmount || 0),
        paidAmount: Number(row.paidAmount || 0),
      }));
    };

    const [curSource, curService, curCounsellor, allSource, allService, allCounsellor] = await Promise.all([
      retention('source', regdateRange), retention('service', regdateRange), retention('counsellor', regdateRange),
      retention('source', feeRange), retention('service', feeRange), retention('counsellor', feeRange),
    ]);

    // Pie charts: leads in range that have not paid yet, by source and by working status.
    const [chartSources, chartStatuses] = await Promise.all([
      run<CountRow>(`
        SELECT s.id AS id, s.name AS name, COUNT(l.id) AS n
          FROM crm_forum_leads l ${sourceJoin}
         WHERE ${regdateRange}${branchSql} AND l.paidYet = 0 AND s.id IS NOT NULL
         GROUP BY s.id, s.name ORDER BY n DESC`),
      run<CountRow>(`
        SELECT NULL AS id, TRIM(l.status) AS name, COUNT(l.id) AS n
          FROM crm_forum_leads l
         WHERE ${regdateRange}${branchSql} AND l.paidYet = 0 AND TRIM(COALESCE(l.status, '')) <> ''
         GROUP BY TRIM(l.status) ORDER BY n DESC`),
    ]);

    return NextResponse.json({
      range: { sdate, edate },
      branches,
      quality: { columns, rows: qualityRows, totals: qualityTotals },
      currentRetention: { bySource: curSource, byProgram: curService, byCounsellor: curCounsellor },
      allRetention: { bySource: allSource, byProgram: allService, byCounsellor: allCounsellor },
      charts: {
        sources: chartSources.map((r) => ({ name: r.name || 'Unknown', count: Number(r.n) })),
        statuses: chartStatuses.map((r) => ({ name: r.name || 'Unknown', count: Number(r.n) })),
      },
    });
  } catch (error) {
    console.error('Marketing leads dashboard failed:', error);
    return NextResponse.json({ error: 'Failed to load the leads dashboard' }, { status: 500 });
  }
}
