import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/apiAuth';
import { addUsageSeconds, getUsageSummary } from '@/lib/usageTracking';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (isAuthError(auth)) return auth;
  if (!auth.id) return NextResponse.json({ ok: false }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  await addUsageSeconds(auth.id, Number(body?.seconds) || 0);
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (isAuthError(auth)) return auth;
  if (!auth.id) return NextResponse.json({ error: 'Not signed in' }, { status: 400 });
  return NextResponse.json(await getUsageSummary(auth.id));
}
