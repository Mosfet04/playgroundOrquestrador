import 'server-only'

import { z } from 'zod'

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
  // Run numa sessão de outro `user_id` (404 "Session not found" no agno 3,
  // AG3-02): só o stream de run o devolve.
  | 'session_not_owned'
  | 'rejected'
  | 'server_error'
  | 'timeout'
  | 'unreachable'
  | 'invalid_response'
  | 'invalid_path'
  // 5xx numa escrita da API Admin (adminConfig.ts, P4-01): pode ter gravado
  // sem entrar no ar.
  | 'not_confirmed'

// `field`/`indexes`: onde a API Admin recusou o corpo (422), sem o valor.
// `notBuildable`/`errorType`: a config não monta no runtime (422 com
// `error_type`, FA-04); o tipo só se for identificador (D-P4-01-2).
// `usedByTeams`: ids dos teams que impedem excluir o agent (409, P3-04).
export type OrchestratorFailure = {
  ok: false
  error: OrchestratorErrorCode
  status?: number
  field?: string
  indexes?: number[]
  notBuildable?: true
  errorType?: string
  usedByTeams?: string[]
}

// `runtimeRevision`: a revisão do runtime que já serve a escrita (header
// `Runtime-Revision` da API Admin, FA-04), quando veio válida. `status`: o
// HTTP da resposta, só em chamada com `acceptStatus`.
export type OrchestratorResult<T> =
  | { ok: true; data: T; runtimeRevision?: number; status?: number }
  | OrchestratorFailure

const ORCHESTRATOR_TIMEOUT_MS = 10_000

type CallOptions<T> = {
  key: OrchestratorKey
  // Valida só os campos usados; o tipo vem do contrato (openapi.d.ts) com
  // `satisfies` em quem declara o schema.
  schema: z.ZodType<T>
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  // Vai na URL por URLSearchParams (valores codificados).
  query?: Record<string, string>
  // Versão lida da config (API Admin): vai no If-Match do PUT/DELETE.
  ifMatch?: number
  // Status de erro cujo corpo vale como resposta (o 503 do /admin/health
  // degradado traz o corpo inteiro, P4-05): passa pelo schema como um 2xx;
  // fora dele, é a falha do status.
  acceptStatus?: number[]
  timeoutMs?: number
}

// O path vai cru na URL, e o parser WHATWG resolve `.`/`..` (também `%2e`),
// troca `\` por `/` e lê `?`/`#` como query e fragmento: um id `..` mudaria a
// rota (e a chave exigida). Path assim, ou mal codificado, nem sai daqui.
// Nem `/` codificado num segmento (`%2F`): um proxy que normaliza o caminho
// o leria como outra rota (review P2-03).
const isSafePath = (path: string) =>
  !/[?#\\]/.test(path) &&
  path.split('/').every((segment) => {
    try {
      const decoded = decodeURIComponent(segment)
      return (
        decoded !== '.' &&
        decoded !== '..' &&
        !decoded.includes('\\') &&
        !decoded.includes('/')
      )
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

function failure(
  method: string,
  path: string,
  error: OrchestratorErrorCode,
  status?: number
): OrchestratorFailure {
  console.warn('[orchestrator] falha', { method, path, error, status })
  return { ok: false, error, status }
}

// 422 da API Admin (admin_config.py): `{detail, field?, indexes?}` ou, se a
// config não monta no runtime, `{detail, error_type}` (nome da exceção). Só o
// nome do campo (identificador curto, com `.` no aninhado), as posições e o
// tipo do erro (identificador, D-P4-01-2) saem daqui; o `detail`, nunca.
const ERROR_TYPE = /^[A-Za-z_][A-Za-z0-9_.]{0,79}$/
const invalidFieldSchema = z.object({
  field: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[A-Za-z_][A-Za-z0-9_]{0,63})?$/)
    .optional()
    .catch(undefined),
  indexes: z
    .array(z.number().int().nonnegative())
    .max(100)
    .optional()
    .catch(undefined),
  error_type: z.unknown()
})

async function invalidField(response: Response) {
  try {
    const parsed = invalidFieldSchema.safeParse(JSON.parse(await response.text()))
    if (!parsed.success) return {}
    const { field, indexes, error_type: errorType } = parsed.data
    return {
      ...(field ? { field } : {}),
      ...(field && indexes ? { indexes } : {}),
      ...(errorType === undefined
        ? {}
        : {
            notBuildable: true as const,
            ...(typeof errorType === 'string' && ERROR_TYPE.test(errorType) ? { errorType } : {})
          })
    }
  } catch {
    // Corpo que não é JSON (ou prazo estourado na leitura): fica só o status.
    return {}
  }
}

// 409 de DELETE com `used_by` (admin_config.py): só a lista de ids de teams
// (D-P3-04-2); os outros tipos e o resto do corpo ficam aqui.
const usedBySchema = z.object({
  used_by: z.object({ teams: z.array(z.string().min(1).max(256)).min(1).max(100) })
})

async function usedByTeams(response: Response) {
  try {
    const parsed = usedBySchema.safeParse(JSON.parse(await response.text()))
    return parsed.success ? { usedByTeams: parsed.data.used_by.teams } : {}
  } catch {
    // Corpo que não é JSON (ou prazo estourado na leitura): fica só o status.
    return {}
  }
}

// Revisão do runtime no header das escritas da API Admin (FA-04): inteiro
// ≥ 0; ausente ou outra coisa some, e a escrita segue aceita.
function runtimeRevision(response: Response) {
  const raw = response.headers.get('runtime-revision')
  return raw && /^\d{1,15}$/.test(raw) ? { runtimeRevision: Number(raw) } : {}
}

// AbortSignal.timeout (e o abort do prazo do stream) rejeita com TimeoutError;
// o resto é rede (DNS, conexão recusada), cuja mensagem cita o host interno.
const fetchError = (error: unknown): OrchestratorErrorCode =>
  error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable'

function target(path: string, key: OrchestratorKey, query?: Record<string, string>) {
  const env = getServerEnv()
  const apiKey =
    key === 'admin' ? env.ORCHESTRATOR_API_KEY_ADMIN : env.ORCHESTRATOR_API_KEY_RUN
  const search = query ? `?${new URLSearchParams(query)}` : ''
  return {
    url: `${env.ORCHESTRATOR_URL.replace(/\/+$/, '')}${path}${search}`,
    authorization: `Bearer ${apiKey}`
  }
}

export async function callOrchestrator<T>(
  path: `/${string}`,
  {
    key,
    schema,
    method = 'GET',
    body,
    query,
    ifMatch,
    acceptStatus,
    timeoutMs = ORCHESTRATOR_TIMEOUT_MS
  }: CallOptions<T>
): Promise<OrchestratorResult<T>> {
  const fail = (error: OrchestratorErrorCode, status?: number) =>
    failure(method, path, error, status)
  if (!isSafePath(path)) return fail('invalid_path')
  const { url, authorization } = target(path, key, query)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(ifMatch === undefined ? {} : { 'If-Match': `"${ifMatch}"` })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    return fail(fetchError(error))
  }

  if (response.status === 422) {
    const where = await invalidField(response)
    return { ...fail('rejected', 422), ...where }
  }
  if (response.status === 409 && method === 'DELETE') {
    const where = await usedByTeams(response)
    return { ...fail('rejected', 409), ...where }
  }
  const accepted = acceptStatus?.includes(response.status) ?? false
  if (!response.ok && !accepted) {
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
    if (parsed.success)
      return {
        ok: true,
        data: parsed.data,
        ...runtimeRevision(response),
        ...(acceptStatus ? { status: response.status } : {})
      }
  } catch (error) {
    // Corpo que não é JSON cai no invalid_response; o timeout no meio da
    // leitura é o único caso que vale distinguir.
    if (error instanceof Error && error.name === 'TimeoutError') return fail('timeout')
  }
  // Status de erro aceito com corpo fora do schema: a falha do status.
  return response.ok
    ? fail('invalid_response', response.status)
    : fail(statusError(response.status), response.status)
}

// 404 de run: `{"detail":"Session not found"}` é a sessão de outro dono; o
// resto (agente inexistente...) segue not_found. O corpo nunca sai daqui.
const sessionNotFoundSchema = z.object({ detail: z.literal('Session not found') })

async function isSessionNotFound(response: Response) {
  try {
    return sessionNotFoundSchema.safeParse(JSON.parse(await response.text())).success
  } catch {
    // Corpo que não é JSON (ou lido além do prazo, que aborta a leitura): é um
    // 404 qualquer.
    return false
  }
}

// Run em stream (P2-03, sempre com a chave run): devolve o corpo cru para o
// BFF repassar sem buffer. O prazo vale só até os cabeçalhos (um run pode
// durar minutos; no 404, também até o fim do corpo); o `signal` do pedido do browser corta o fetch e o corpo, e
// o orquestrador vê a conexão fechar.
export async function streamOrchestrator(
  path: `/${string}`,
  {
    form,
    signal,
    timeoutMs = ORCHESTRATOR_TIMEOUT_MS
  }: { form: FormData; signal: AbortSignal; timeoutMs?: number }
): Promise<OrchestratorResult<ReadableStream<Uint8Array>>> {
  const fail = (error: OrchestratorErrorCode, status?: number) =>
    failure('POST', path, error, status)
  if (!isSafePath(path)) return fail('invalid_path')
  const { url, authorization } = target(path, 'run')
  const deadline = new AbortController()
  const timer = setTimeout(
    () => deadline.abort(new DOMException('Sem cabeçalhos no prazo', 'TimeoutError')),
    timeoutMs
  )

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authorization },
      body: form,
      signal: AbortSignal.any([signal, deadline.signal])
    })
  } catch (error) {
    clearTimeout(timer)
    // O browser saiu antes dos cabeçalhos: ninguém lê a resposta e não é
    // falha do orquestrador (sem log).
    if (signal.aborted) return { ok: false, error: 'unreachable' }
    return fail(fetchError(error))
  }
  // O corpo do 404 é lido ainda sob o prazo (que aborta a leitura); só depois
  // o timer cai.
  const notOwned = response.status === 404 && (await isSessionNotFound(response))
  clearTimeout(timer)
  if (notOwned) return fail('session_not_owned', 404)
  if (!response.ok) {
    // Libera a conexão sem ler (o corpo do 404 já foi lido acima).
    if (response.status !== 404) void response.body?.cancel()
    return fail(statusError(response.status), response.status)
  }
  if (!response.body) return fail('invalid_response', response.status)
  return { ok: true, data: response.body }
}
