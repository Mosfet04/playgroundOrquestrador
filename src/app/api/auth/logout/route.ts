import { NextResponse } from 'next/server'

import { SESSION_COOKIE } from '@/server/session'

// A sessão é só o cookie assinado: sair é apagá-lo.
export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete(SESSION_COOKIE)
  return response
}
