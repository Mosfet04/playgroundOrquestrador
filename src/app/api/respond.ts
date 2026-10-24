import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import type { OrchestratorErrorCode } from '@/server/orchestrator/client'
import { SESSION_COOKIE, verifySession } from '@/server/session'

// Respostas dos route handlers que chamam o orquestrador (chat, dashboard). Sem
// resposta do orquestrador (fora do ar, prazo) é 503/504 e a UI mostra
// "offline"; o resto, o status e o código, sem eco do corpo nem da exceção.
const STATUS: Record<OrchestratorErrorCode, number> = {
  unreachable: 503,
  timeout: 504,
  invalid_path: 400,
  not_found: 404,
  unauthorized: 502,
  forbidden: 502,
  rejected: 502,
  server_error: 502,
  invalid_response: 502
}

export const orchestratorError = (error: OrchestratorErrorCode) =>
  NextResponse.json({ success: false, error }, { status: STATUS[error] })

export const badRequest = () =>
  NextResponse.json(
    { success: false, error: 'invalid_request' },
    { status: 400 }
  )

export const ok = (data?: unknown) =>
  NextResponse.json(
    data === undefined ? { success: true } : { success: true, data }
  )

export const idSchema = z.string().min(1).max(256)
export const kindSchema = z.enum(['agent', 'team'])

// O middleware já exige a sessão; aqui ela dá o user_id dos runs.
export async function sessionUser(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  return token ? ((await verifySession(token))?.username ?? null) : null
}
