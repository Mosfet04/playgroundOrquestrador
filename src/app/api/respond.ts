import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import type {
  OrchestratorErrorCode,
  OrchestratorFailure
} from '@/server/orchestrator/client'
import { SESSION_COOKIE, verifySession } from '@/server/session'

// Respostas dos route handlers que chamam o orquestrador (chat, dashboard, CRUD). Sem
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

// Recusas da API Admin (CRUD de agents/tools, P2-06): id existente ou em uso
// (409), versão divergente (412) e corpo recusado (422, com o campo do
// formulário quando há). Sem o detalhe; de quem usa a entidade, só os ids dos
// teams de um agent membro (409, D-P3-04-2).
const CONFIG_REFUSALS: Record<number, string> = {
  409: 'conflict',
  412: 'version_conflict',
  422: 'invalid_config'
}

export function configError(failure: OrchestratorFailure) {
  const error =
    failure.error === 'rejected' && failure.status !== undefined
      ? CONFIG_REFUSALS[failure.status]
      : undefined
  if (!error || failure.status === undefined) return orchestratorError(failure.error)
  return NextResponse.json(
    {
      success: false,
      error,
      ...(failure.status === 422 && failure.field ? { field: failure.field } : {}),
      ...(failure.status === 409 && failure.usedByTeams
        ? { used_by: { teams: failure.usedByTeams } }
        : {})
    },
    { status: failure.status }
  )
}

// Versão lida da config, que o browser reenvia em `If-Match: "<n>"` (ou sem
// aspas) no PUT/DELETE; outra coisa ⇒ null (400).
export function ifMatchVersion(request: NextRequest) {
  const raw = request.headers.get('if-match')?.trim().replace(/^"(.*)"$/, '$1')
  return raw && /^\d{1,15}$/.test(raw) ? Number(raw) : null
}

// DELETE do item (P3-06, D-P3-06-4): `?soft=true` desativa, sem `soft` exclui
// de vez; qualquer outra forma de `soft` é pedido malformado (null ⇒ 400).
export function deleteMode(request: NextRequest): 'soft' | 'hard' | null {
  const values = request.nextUrl.searchParams.getAll('soft')
  if (values.length === 0) return 'hard'
  return values.length === 1 && values[0] === 'true' ? 'soft' : null
}

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
