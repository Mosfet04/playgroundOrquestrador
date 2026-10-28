import 'server-only'

import { z } from 'zod'

import { callOrchestrator, streamOrchestrator } from './client'
import type { components } from './openapi'

// Chat do playground pelo BFF (P2-03): listas do AgentOS, sessões e runs.
// Os ids vêm do browser e entram no path com encodeURIComponent (o `..` que
// sobra é recusado pelo isSafePath do cliente como invalid_path).

export type ChatKind = 'agent' | 'team'

type Schemas = components['schemas']

const entitySchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  model: z
    .object({ provider: z.string().nullish(), model: z.string().nullish() })
    .nullish(),
  sessions: z.record(z.string(), z.unknown()).nullish()
}) satisfies z.ZodType<
  Pick<
    Schemas['AgentResponse'] & Schemas['TeamResponse'],
    'id' | 'name' | 'model' | 'sessions'
  >
>

// Só o que o cartão e o seletor usam (instruções e tools não vão ao browser).
export async function listEntities(kind: ChatKind) {
  const result = await callOrchestrator(
    kind === 'agent' ? '/agents' : '/teams',
    {
      key: 'run',
      schema: z.array(entitySchema)
    }
  )
  if (!result.ok) return result
  return {
    ok: true as const,
    data: result.data.flatMap((item) =>
      item.id
        ? [
            {
              value: item.id,
              label: item.name ?? '',
              model: {
                provider: item.model?.provider ?? '',
                model: item.model?.model ?? ''
              },
              storage: Boolean(item.sessions)
            }
          ]
        : []
    )
  }
}

const sessionListSchema = z.object({
  data: z.array(
    z.object({
      session_id: z.string(),
      session_name: z.string(),
      created_at: z.string().nullish(),
      updated_at: z.string().nullish()
    })
  )
}) satisfies z.ZodType<{
  data: Pick<
    Schemas['SessionSchema'],
    'session_id' | 'session_name' | 'created_at' | 'updated_at'
  >[]
}>

export async function listSessions(kind: ChatKind, componentId: string) {
  const result = await callOrchestrator('/sessions', {
    key: 'run',
    schema: sessionListSchema,
    query: {
      type: kind,
      component_id: componentId,
      limit: '20',
      page: '1',
      sort_by: 'updated_at',
      sort_order: 'desc'
    }
  })
  // Sem storage o AgentOS responde 404: a lista fica vazia.
  if (!result.ok)
    return result.error === 'not_found'
      ? { ok: true as const, data: [] }
      : result
  return {
    ok: true as const,
    data: result.data.data.map((session) => ({
      session_id: session.session_id,
      title: session.session_name,
      created_at:
        Math.floor(
          Date.parse(session.created_at ?? session.updated_at ?? '') / 1000
        ) || 0
    }))
  }
}

// O histórico traz também as mensagens de sistema (instruções, memórias):
// só user/assistant, e só os campos mostrados, chegam ao browser.
const historyEntrySchema = z.object({
  role: z.string().optional(),
  content: z.unknown(),
  created_at: z.number().nullish()
})
const sessionDetailSchema = z.object({
  chat_history: z.array(historyEntrySchema).nullish()
}) satisfies z.ZodType<{ chat_history?: Record<string, unknown>[] | null }>

export async function getSessionHistory(kind: ChatKind, sessionId: string) {
  const result = await callOrchestrator(
    `/sessions/${encodeURIComponent(sessionId)}`,
    {
      key: 'run',
      schema: sessionDetailSchema,
      query: { type: kind }
    }
  )
  if (!result.ok) return result
  return {
    ok: true as const,
    data: {
      chat_history: (result.data.chat_history ?? []).filter(
        (entry) => entry.role === 'user' || entry.role === 'assistant'
      )
    }
  }
}

// DELETE /sessions* exige a chave admin no orquestrador.
export const deleteSession = (sessionId: string) =>
  callOrchestrator(`/sessions/${encodeURIComponent(sessionId)}`, {
    key: 'admin',
    method: 'DELETE',
    schema: z.unknown()
  })

export function streamRun(
  kind: ChatKind,
  id: string,
  {
    message,
    sessionId,
    userId
  }: { message: string; sessionId?: string; userId: string },
  signal: AbortSignal
) {
  const form = new FormData()
  form.set('message', message)
  form.set('stream', 'true')
  if (sessionId) form.set('session_id', sessionId)
  form.set('user_id', userId)
  if (kind === 'team') form.set('monitor', 'true')
  return streamOrchestrator(`/${kind}s/${encodeURIComponent(id)}/runs`, {
    form,
    signal
  })
}
