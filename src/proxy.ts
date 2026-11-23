import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecret } from '@/lib/jwtSecret';

// Edge-safe mirror of src/lib/auth.ts's verifyToken(): that file pulls in
// jsonwebtoken + sequelize (Node-only), which can't run in middleware, so
// this uses `jose` against the same HS256 secret/algorithm instead. Every
// /admin page already re-checks auth client-side via ProtectedRoute
// (src/components/auth/ProtectedRoute.tsx) and every API route re-checks via
// requireAuth() (src/lib/apiAuth.ts) - this is a first line of defense so an
// unauthenticated request never even reaches the admin page shell, not a
// replacement for either.
const encodedSecret = new TextEncoder().encode(getJwtSecret());

type StaffSession = { valid: boolean; roleName: string };

async function readStaffSession(request: NextRequest): Promise<StaffSession> {
  const token = request.cookies.get('auth-token')?.value;
  if (!token) return { valid: false, roleName: '' };

  try {
    const { payload } = await jwtVerify(token, encodedSecret, { algorithms: ['HS256'] });
    // A client-portal token (src/lib/clientAuth.ts) carries principalType:'client'
    // and must never satisfy the staff gate, matching requireAuth()'s own check.
    return { valid: payload.principalType !== 'client', roleName: String(payload.roleName || '').trim().toLowerCase() };
  } catch {
    return { valid: false, roleName: '' };
  }
}

// The Marketing login is a single-purpose account: it may open the Leads Quality report and nothing else. The UI hides
// everything else, but this is the enforcement point - any other page redirects to the report, and any API outside this
// short list is refused, so the account cannot read other data by calling the endpoints directly.
const MARKETING_PAGE = '/admin/marketing-leads';
const MARKETING_ALLOWED_API = [
  '/api/admin/marketing-leads-dashboard',
  '/api/auth/',
  '/api/branch-currency',
  '/api/profile/change-password',
  '/api/health',
  '/api/client-error-report',
];

// Next.js 16 renamed the middleware convention to "proxy" - this file must
// live at src/proxy.ts and export a function named `proxy` (or default).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readStaffSession(request);
  const isMarketing = session.valid && session.roleName === 'marketing';

  if (pathname.startsWith('/api/')) {
    // APIs keep their own per-route auth; the proxy only fences in the Marketing account.
    if (isMarketing && !MARKETING_ALLOWED_API.some((allowed) => pathname === allowed || pathname.startsWith(allowed.endsWith('/') ? allowed : allowed + '/'))) {
      return NextResponse.json({ error: 'This account can only use the Leads Quality report' }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (!session.valid) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isMarketing && pathname !== MARKETING_PAGE && pathname !== MARKETING_PAGE + '/') {
    return NextResponse.redirect(new URL(MARKETING_PAGE, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
