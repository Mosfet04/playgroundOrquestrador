import { NextResponse, type NextRequest } from 'next/server'

import { safeNextPath } from '@/lib/safeNext'
import { SESSION_COOKIE, verifySession } from '@/server/session'

const LOGIN_PAGE = '/login'
const LOGIN_API = '/api/auth/login'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const apiError = (status: number, error: string) =>
  NextResponse.json({ success: false, error }, { status })

// Origin do próprio host, como o Next confere nas server actions: `host` ou o
// 1º `x-forwarded-host`. Sem Origin (ou "null") é recusado.
function isSameOrigin(request: NextRequest) {
  const originHost = /^https?:\/\/([^/]+)$/.exec(
    request.headers.get('origin') ?? ''
  )?.[1]
  if (!originHost) return false
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim()
  return (
    originHost === request.headers.get('host') || originHost === forwardedHost
  )
}

// P2-01: páginas e /api/* só com sessão, menos /login e o POST de login.
export async function middleware(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl
  const isApi = pathname === '/api' || pathname.startsWith('/api/')

  if (isApi && !SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
    return apiError(403, 'forbidden_origin')
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token) : null

  if (pathname === LOGIN_PAGE) {
    // O POST da server action de idioma também passa por aqui.
    if (session && request.method === 'GET') {
      return NextResponse.redirect(
        new URL(safeNextPath(searchParams.get('next')), request.url)
      )
    }
    return NextResponse.next()
  }
  if (session || pathname === LOGIN_API) return NextResponse.next()
  if (isApi) return apiError(401, 'unauthorized')

  // Cookie presente e recusado (vencido ou adulterado): avisa e apaga
  // (decisão 0017, D-P2-01-2).
  const login = new URL(LOGIN_PAGE, request.url)
  if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`)
  if (token !== undefined) login.searchParams.set('reason', 'expired')
  const response = NextResponse.redirect(login)
  if (token !== undefined) response.cookies.delete(SESSION_COOKIE)
  return response
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico).*)']
}
