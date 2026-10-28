import { isIP } from 'node:net'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { parseJsonBody } from '@/app/api/parseJsonBody'
import { getServerEnv } from '@/server/env'
import { verifyCredentials } from '@/server/password'
import { createLoginLimiter } from '@/server/rateLimit'
import { createSession, sessionCookie } from '@/server/session'

// scrypt é do node:crypto.
export const runtime = 'nodejs'

const loginSchema = z.object({
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024)
})

const limiter = createLoginLimiter()

const failure = (status: number, error: string, headers?: HeadersInit) =>
  NextResponse.json({ success: false, error }, { status, headers })

// O último IP do X-Forwarded-For é o que o proxy viu (os anteriores vêm do
// cliente). Sem proxy que o grave, o cliente escolhe o valor: ver o README.
// O que não for IP cai no balde comum "unknown".
const clientIp = (request: NextRequest) => {
  const last = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
  return last && isIP(last) ? last : 'unknown'
}

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, loginSchema)
  if (!parsed.success) return parsed.response

  // Reserva a tentativa antes do scrypt (sem await entre conferir e contar).
  const ip = clientIp(request)
  const retryAfter = limiter.attempt(ip)
  if (retryAfter > 0) {
    return failure(429, 'too_many_attempts', {
      'Retry-After': String(retryAfter)
    })
  }

  const { username, password } = parsed.data
  if (!(await verifyCredentials(username, password, getServerEnv()))) {
    return failure(401, 'invalid_credentials')
  }

  limiter.reset(ip)
  const response = NextResponse.json({ success: true })
  response.cookies.set(sessionCookie(await createSession(username)))
  return response
}
