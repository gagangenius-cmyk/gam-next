import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/apiAuth';
import { isCeo } from '@/lib/roleChecks';
import { getAppSettings, updateAppSettings, type AppSettingKey } from '@/lib/appSettings';
import { clientIpFromHeaders } from '@/lib/clientNetwork';

// Readable by any signed-in staff member (the UI needs the reminder lead time and payment surcharges); only the
// CEO / Chairman can change them.
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (isAuthError(auth)) return auth;
  const settings = await getAppSettings();
  return NextResponse.json({ settings, yourIp: clientIpFromHeaders(request.headers), canEdit: isCeo(auth as never) });
}

export async function PUT(request: NextRequest) {
  const auth = requireAuth(request);
  if (isAuthError(auth)) return auth;
  if (!isCeo(auth as never)) return NextResponse.json({ error: 'Only the CEO can change CRM settings' }, { status: 403 });
  try {
    const body = await request.json();
    const settings = await updateAppSettings((body?.settings || {}) as Partial<Record<AppSettingKey, unknown>>, auth.id ?? null);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save settings' }, { status: 400 });
  }
}
