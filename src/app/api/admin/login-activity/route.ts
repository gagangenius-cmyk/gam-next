import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/apiAuth';
import { isCeo, isBranchManagerOrCeo } from '@/lib/roleChecks';
import { listLoginLogs } from '@/lib/loginActivity';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (isAuthError(auth)) return auth;
  if (!isBranchManagerOrCeo(auth as never) && !isCeo(auth as never)) {
    return NextResponse.json({ error: 'Only Branch Manager or CEO can view login activity' }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 200);
  const page = Math.max(Number(sp.get('page')) || 1, 1);
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const { rows, total } = await listLoginLogs({
    from: date(sp.get('from')),
    to: date(sp.get('to')),
    employeeId: Number(sp.get('employeeId')) || undefined,
    event: sp.get('event') || undefined,
    search: sp.get('search')?.trim() || undefined,
    limit,
    offset: (page - 1) * limit,
  });
  return NextResponse.json({ rows, total, page, limit });
}
