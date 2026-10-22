import 'server-only'

import type { z } from 'zod'

import { getServerEnv } from '@/server/env'

// Cliente único do orquestrador (P2-02). A chave vai em `Authorization:
// Bearer`: `admin` em /admin*, /metrics* e DELETE /sessions*, `run` no resto
// (o orquestrador responde 401 sem chave válida e 403 com a run em rota admin).
// Toda falha vira um código próprio: quem chama nunca vê corpo, exceção, URL
// interna nem chave.

export type OrchestratorKey = 'run' | 'admin'

export type OrchestratorErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rejected'
  | 'server_error'
  | 'timeout'
  | 'unreachable'
  | 'invalid_response'
  | 'invalid_path'

export type OrchestratorResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: OrchestratorErrorCode; status?: number }

const ORCHESTRATOR_TIMEOUT_MS = 10_000

type CallOptions<T> = {
  key: OrchestratorKey
  // Valida só os campos usados; o tipo vem do contrato (openapi.d.ts) com
  // `satisfies` em quem declara o schema.
  schema: z.ZodType<T>
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
}

// O path vai cru na URL, e o parser WHATWG resolve `.`/`..` (também `%2e`),
// troca `\` por `/` e lê `?`/`#` como query e fragmento: um id `..` mudaria a
// rota (e a chave exigida). Path assim, ou mal codificado, nem sai daqui.
const isSafePath = (path: string) =>
  !/[?#\\]/.test(path) &&
  path.split('/').every((segment) => {
    try {
      const decoded = decodeURIComponent(segment)
      return decoded !== '.' && decoded !== '..' && !decoded.includes('\\')
    } catch {
      return false
    }
  })

const statusError = (status: number): OrchestratorErrorCode => {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  return status >= 500 ? 'server_error' : 'rejected'
}

export async function callOrchestrator<T>(
  path: `/${string}`,
  { key, schema, method = 'GET', body, timeoutMs = ORCHESTRATOR_TIMEOUT_MS }: CallOptions<T>
): Promise<OrchestratorResult<T>> {
  const fail = (error: OrchestratorErrorCode, status?: number): OrchestratorResult<T> => {
    console.warn('[orchestrator] falha', { method, path, error, status })
    return { ok: false, error, status }
  }
  if (!isSafePath(path)) return fail('invalid_path')
  const env = getServerEnv()
  const apiKey =
    key === 'admin' ? env.ORCHESTRATOR_API_KEY_ADMIN : env.ORCHESTRATOR_API_KEY_RUN

  let response: Response
  try {
    response = await fetch(`${env.ORCHESTRATOR_URL.replace(/\/+$/, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    // AbortSignal.timeout rejeita com TimeoutError; o resto é rede (DNS,
    // conexão recusada), cuja mensagem cita o host interno.
    return fail(
      error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable'
    )
  }

  if (!response.ok) {
    // Libera a conexão sem ler o corpo (que não sai daqui). Sem await: o
    // cancel de um corpo ainda chegando pode demorar, e o stream não está
    // travado (nunca lido), então não rejeita.
    void response.body?.cancel()
    return fail(statusError(response.status), response.status)
  }
  try {
    // Corpo vazio (204 do DELETE) é `undefined` para o schema.
    const text = await response.text()
    const parsed = schema.safeParse(text === '' ? undefined : JSON.parse(text))
    if (parsed.success) return { ok: true, data: parsed.data }
  } catch (error) {
    // Corpo que não é JSON cai no invalid_response; o timeout no meio da
    // leitura é o único caso que vale distinguir.
    if (error instanceof Error && error.name === 'TimeoutError') return fail('timeout')
  }
  return fail('invalid_response', response.status)
}
