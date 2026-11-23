import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/sequelize';
import { requireAuth, isAuthError } from '@/lib/apiAuth';
import { assertLeadAccess } from '@/lib/leadAccess';
import { isFoeOrBranchManagerOrCeo } from '@/lib/roleChecks';
import { getRedFlag, setRedFlag } from '@/lib/redFlag';
import { logLeadRemark } from '@/lib/leadRemarks';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = requireAuth(request);
  if (isAuthError(auth)) return auth;
  const leadId = Number((await params).id);
  if (!leadId) return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 });
  const denied = await assertLeadAccess(auth, leadId);
  if (denied) return denied;
  await connectDB();
  return NextResponse.json(await getRedFlag(leadId));
}

// Anyone who can work the lead may raise a red flag (a reason is mandatory); only FOE / Branch Manager / CEO clear it.
export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = requireAuth(request);
  if (isAuthError(auth)) return auth;
  const leadId = Number((await params).id);
  if (!leadId) return NextResponse.json({ error: 'Invalid lead id' }, { status: 400 });
  const denied = await assertLeadAccess(auth, leadId);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const flagged = body?.flagged !== false;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (flagged && !reason) return NextResponse.json({ error: 'A reason is required to raise a red flag' }, { status: 400 });
  if (!flagged && !isFoeOrBranchManagerOrCeo(auth)) {
    return NextResponse.json({ error: 'Only FOE, Branch Manager or CEO can clear a red flag' }, { status: 403 });
  }

  await connectDB();
  await setRedFlag(leadId, flagged, flagged ? reason : null, Number(auth.id));
  await logLeadRemark({
    leadId,
    action: flagged ? 'red_flag_raised' : 'red_flag_cleared',
    remark: flagged ? `Red flag raised: ${reason}` : 'Red flag cleared',
    actorId: Number(auth.id),
    actorRole: auth.roleName || auth.type || null,
  });
  return NextResponse.json(await getRedFlag(leadId));
}
