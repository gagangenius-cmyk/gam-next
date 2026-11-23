import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { clientIpFromHeaders } from '@/lib/clientNetwork'
import { recordLoginEvent } from '@/lib/loginActivity'

export async function POST(request: NextRequest) {
  try {
    // Best-effort: note who signed out (the cookie is cleared regardless).
    const token = request.cookies.get('auth-token')?.value
    const user = token ? verifyToken(token) : null
    if (user) {
      await recordLoginEvent({
        employeeId: user.id,
        username: user.name,
        event: 'logout',
        success: true,
        ip: clientIpFromHeaders(request.headers),
        userAgent: request.headers.get('user-agent'),
      })
    }

    const response = NextResponse.json({
      message: 'Logout successful'
    })

    // Clear the auth token cookie
    response.cookies.set('auth-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0
    })

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
