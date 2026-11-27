import 'server-only'

import { z } from 'zod'

import { getServerEnv } from '@/server/env'
import type { RunFailure } from '@/types/playground'

// Erro do run no stream (QA1-03, D-QA1-03-1). O agno encerra o run com
// RunError/TeamRunError e o `content` é o str() da exceção do provedor: o
// browser recebe só um código do playground e esse texto saneado em `detail`.

// Sobrecarga ou limite do provedor: 503 "high demand"/UNAVAILABLE do Gemini,
// 429 e limite de taxa (OpenAI, Gemini RESOURCE_EXHAUSTED), 529 overloaded da
// Anthropic. Os status do gRPC só em caixa alta ("unavailable" solto é outra
// coisa); a cota esgotada (`insufficient_quota`, 429 da OpenAI) é cobrança.
const OVERLOADED_TEXT = /high demand|overloaded|rate.?limit|too many requests/i
const OVERLOADED_STATUS = /\bUNAVAILABLE\b|\bRESOURCE_EXHAUSTED\b|\b(?:429|503|529)\b/
const NOT_OVERLOADED = /insufficient_quota/
// str() do ValidationError do pydantic 2 na config de geração do Gemini (os
// parâmetros do modelo; o google-genai é o único provedor que os valida com
// pydantic): "N validation error(s) for GenerateContentConfig" e, na linha
// seguinte, o campo (`loc`), sem recuo.
const PYDANTIC_PARAM =
  /\b\d+ validation errors? for GenerateContentConfig\n([A-Za-z_][\w.]{0,63})\n/

// Teto do texto lido: a classificação e o saneamento são lineares, mas o
// detalhe vai para a tela e o provedor pode mandar um corpo enorme.
const MAX_DETAIL = 8_000

function classifyRunError(content: string | undefined): RunFailure {
  if (!content) return { kind: 'other' }
  const head = content.slice(0, MAX_DETAIL)
  const detail = sanitize(content)
  const withDetail = detail ? { detail } : {}
  const param = head.match(PYDANTIC_PARAM)?.[1]
  if (param) return { kind: 'invalidParam', param, ...withDetail }
  const overloaded =
    !NOT_OVERLOADED.test(head) && (OVERLOADED_TEXT.test(head) || OVERLOADED_STATUS.test(head))
  return { kind: overloaded ? 'overloaded' : 'other', ...withDetail }
}

// Segredos genéricos (o provedor ecoa a URL ou o header do pedido). Cada
// padrão só começa num limite (lookbehind ou literal), para não varrer de novo
// a mesma palavra a cada posição.
const GENERIC_SECRETS: [RegExp, string][] = [
  // usuário e senha na URL (scheme://user:pass@host)
  [/(?<![\w+.-])([a-z][\w+.-]*:\/\/)[^\s/@'"]+@/gi, '$1[redacted]@'],
  // chave, token, segredo ou senha na query
  [/([?&][\w-]*(?:key|token|secret|password)=)[^&\s'"]+/gi, '$1[redacted]'],
  [/\bBearer\s+[^\s'"]+/gi, 'Bearer [redacted]'],
  // credencial Basic (base64 com dígito, + , / ou =; "Basic authentication" fica)
  [/\bBasic\s+(?=[A-Za-z]*[0-9+/=])[A-Za-z0-9+/]{8,}={0,2}/g, 'Basic [redacted]'],
  // chave do Google (Gemini) em qualquer lugar, como no header x-goog-api-key
  [/(?<![\w-])AIza[\w-]{10,}/g, '[redacted]'],
  [/(?<![\w-])sk-[\w-]{8,}/g, '[redacted]']
]
const TRACEBACK = 'Traceback (most recent call last):'

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Sem stack (o bloco do Traceback e as linhas `File "...", line N`), sem as
// chaves e o endereço do orquestrador e sem segredo genérico. Os segredos saem
// do texto inteiro (tudo linear), antes do corte, para não sobrar o começo de
// um que cruze os 8k (review D1).
function sanitize(content: string) {
  const { ORCHESTRATOR_URL, ORCHESTRATOR_API_KEY_RUN, ORCHESTRATOR_API_KEY_ADMIN } =
    getServerEnv()
  // O host entre limites: com hostname curto, "orquestra" não é "orq" (D5).
  const internalHost = new RegExp(
    `(?<![\\w.-])${escapeRegExp(new URL(ORCHESTRATOR_URL).hostname)}(?![\\w-])`
  )
  const redacted = GENERIC_SECRETS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    [ORCHESTRATOR_API_KEY_RUN, ORCHESTRATOR_API_KEY_ADMIN]
      .reduce((text, key) => text.replaceAll(key, '[redacted]'), content)
      // Palavra que cita o host (com ou sem porta, esquema, caminho) sai inteira.
      .split(/(\s+)/)
      .map((word) => (internalHost.test(word) ? '[orquestrador]' : word))
      .join('')
  )
  const text = redacted.length > MAX_DETAIL ? `${redacted.slice(0, MAX_DETAIL)}…` : redacted
  const kept: string[] = []
  let inTraceback = false
  for (const line of text.split('\n')) {
    const traceback = line.indexOf(TRACEBACK)
    if (traceback !== -1) {
      const before = line.slice(0, traceback).trimEnd()
      if (before) kept.push(before)
      inTraceback = true
      continue
    }
    // No Traceback, as linhas recuadas são a pilha; a 1ª sem recuo é a exceção.
    if (inTraceback && /^\s/.test(line)) continue
    inTraceback = false
    if (/^\s*File ".*", line \d+/.test(line)) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

const RUN_ERROR_EVENTS = ['RunError', 'TeamRunError'] as const
const runErrorDataSchema = z.object({
  event: z.enum(RUN_ERROR_EVENTS).optional().catch(undefined),
  session_id: z.string().optional().catch(undefined),
  content: z.string().optional().catch(undefined)
})

// Os dados do evento; undefined quando o JSON não se lê.
const parseData = (block: string) => {
  const dataLine = block.split('\n').find((line) => line.startsWith('data:'))
  try {
    return runErrorDataSchema.catch({}).parse(JSON.parse(dataLine?.slice('data:'.length) ?? ''))
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return undefined
  }
}

// O tipo no texto do `data`, para o fallback cujo JSON não se lê (review D2).
const RUN_ERROR_MARKER = /"event"\s*:\s*"(RunError|TeamRunError)"/

// Um evento SSE do agno ("event: <tipo>\ndata: <json>"): o RunError sai só com
// o tipo, a sessão e o erro classificado (sem error_type, additional_data...).
// Vale também o fallback `event: message` do agno (agno/os/utils.py), com o
// tipo só no `data`. RunError cujo JSON não se lê vira `other` sem detalhe,
// nunca o texto cru.
function rewriteEvent(block: string) {
  const named = RUN_ERROR_EVENTS.find((name) => block.startsWith(`event: ${name}\n`))
  if (!named && !block.includes('RunError')) return block
  const data = parseData(block)
  const marked = data ? undefined : block.match(RUN_ERROR_MARKER)?.[1]
  const event = named ?? data?.event ?? RUN_ERROR_EVENTS.find((name) => name === marked)
  if (!event) return block
  const payload = { event, session_id: data?.session_id, error: classifyRunError(data?.content) }
  return `event: ${event}\ndata: ${JSON.stringify(payload)}`
}

const EVENT_END = '\n\n'

// O corpo do run passa evento a evento (sem esperar o fim do run); só o
// RunError é reescrito, inclusive o que o fim do stream deixou pela metade.
export function classifyRunErrors(body: ReadableStream<Uint8Array>) {
  // Pedaços ainda sem fim de evento: juntar a cada chunk (`+=`) achataria o
  // buffer inteiro de novo, e um evento grande em chunks pequenos fica
  // quadrático (review R5).
  let pending: string[] = []
  const events = new TransformStream<string, string>({
    transform(chunk, controller) {
      // Só o trecho novo pode ter o fim de evento (com o último caractere do
      // anterior, se o `\n\n` vier partido entre os chunks).
      if (!((pending.at(-1) ?? '').slice(-1) + chunk).includes(EVENT_END)) {
        pending.push(chunk)
        return
      }
      const text = pending.join('') + chunk
      const end = text.lastIndexOf(EVENT_END)
      pending = [text.slice(end + EVENT_END.length)]
      controller.enqueue(
        text.slice(0, end).split(EVENT_END).map(rewriteEvent).join(EVENT_END) + EVENT_END
      )
    },
    flush(controller) {
      const rest = pending.join('')
      if (rest) controller.enqueue(rewriteEvent(rest))
    }
  })
  return body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(events)
    .pipeThrough(new TextEncoderStream())
}
