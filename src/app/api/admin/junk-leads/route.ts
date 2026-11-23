import { NextRequest, NextResponse } from 'next/server';
import { QueryTypes } from 'sequelize';
import { sequelize, connectDB } from '@/lib/sequelize';
import { requireAuth, isAuthError } from '@/lib/apiAuth';
import { getRecordVisibilityScope } from '@/lib/roleChecks';
import { ensureJunkColumns } from '@/lib/junkLeads';

// Junk (closed) leads, scoped like every other lead list: counselors see their own, branch roles their branch, the
// company-wide roles everything.
export async function GET(request: NextRequest) {
  const auth = requireAuth(request, ['leads.view']);
  if (isAuthError(auth)) return auth;
  await connectDB();
  await ensureJunkColumns();

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 200);
  const page = Math.max(Number(sp.get('page')) || 1, 1);
  const where: string[] = ["(LOWER(TRIM(l.status)) = 'junk' OR l.closed_at IS NOT NULL)"];
  const replacements: Record<string, unknown> = { limit, offset: (page - 1) * limit };

  const scope = getRecordVisibilityScope(auth);
  if (scope === 'branch') { where.push('l.branch = :branch'); replacements.branch = auth.branch || 0; }
  else if (scope === 'region') { where.push('l.region = :region'); replacements.region = auth.region || 0; }
  else if (scope !== 'all') { where.push('(l.Counsilor = :uid OR l.assignTo = :uid)'); replacements.uid = auth.id; }

  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = date(sp.get('from'));
  const to = date(sp.get('to'));
  if (from) { where.push('COALESCE(l.closed_at, l.last_updated) >= :from'); replacements.from = `${from} 00:00:00`; }
  if (to) { where.push('COALESCE(l.closed_at, l.last_updated) <= :to'); replacements.to = `${to} 23:59:59`; }
  const search = sp.get('search')?.trim();
  if (search) { where.push("(CONCAT_WS(' ', l.fname, l.lname) LIKE :q OR l.phone LIKE :q OR l.email LIKE :q)"); replacements.q = `%${search}%`; }

  const whereSql = where.join(' AND ');
  const [count] = await sequelize.query<{ total: number }>(`SELECT COUNT(*) AS total FROM crm_forum_leads l WHERE ${whereSql}`, { replacements, type: QueryTypes.SELECT });
  const rows = await sequelize.query(
    `SELECT l.id, TRIM(CONCAT(COALESCE(l.fname, ''), ' ', COALESCE(l.lname, ''))) AS name, l.phone, l.email,
            l.closed_at, l.closed_reason, l.last_updated,
            c.name AS counselor_name, cb.name AS closed_by_name, b.branch AS branch_name
       FROM crm_forum_leads l
       LEFT JOIN crm_employee c ON c.id = COALESCE(l.Counsilor, l.assignTo)
       LEFT JOIN crm_employee cb ON cb.id = l.closed_by
       LEFT JOIN crm_branch b ON b.id = l.branch
      WHERE ${whereSql}
      ORDER BY COALESCE(l.closed_at, l.last_updated) DESC
      LIMIT :limit OFFSET :offset`,
    { replacements, type: QueryTypes.SELECT },
  );
  return NextResponse.json({ rows, total: Number(count?.total || 0), page, limit });
}
