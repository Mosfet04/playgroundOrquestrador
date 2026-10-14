import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { usePlaygroundStore } from '@/store'

import { AGENTOS_URL } from '../msw/handlers'
import { server } from '../msw/server'

const initialStoreState = usePlaygroundStore.getState()

// Mesmo framing SSE do AgentOS (agno/os/utils.py: format_sse_event).
const sseStream = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )

const contentEvents = (event: string, deltas: string[]) =>
  deltas.map((content) => ({
    event,
    content,
    content_type: 'str',
    session_id: 'session-1',
    created_at: 1
  }))

// O handler monta o user_id com o IP (ipify) e o FingerprintJS (monitoramento
// amostrado em 0,1%): responde aqui para nada sair do MSW.
const externalHandlers = [
  http.get('https://api.ipify.org', () =>
    HttpResponse.json({ ip: '203.0.113.1' })
  ),
  http.get('https://m1.openfpcdn.io/*', () => new HttpResponse(null))
]

const sendMessage = async (mode: 'agent' | 'team', searchParams: string) => {
  usePlaygroundStore.setState({ mode, selectedEndpoint: AGENTOS_URL })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NuqsTestingAdapter searchParams={searchParams}>
      {children}
    </NuqsTestingAdapter>
  )
  const { result } = renderHook(() => useAIChatStreamHandler(), { wrapper })
  await act(() => result.current.handleStreamResponse('oi'))
  const messages = usePlaygroundStore.getState().messages
  return messages[messages.length - 1]
}

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('useAIChatStreamHandler: deltas do agno 2.5', () => {
  it('anexa cada RunContent, inclusive delta igual ao anterior', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/agents/agent-1/runs`, () =>
        sseStream(contentEvents('RunContent', ['a', 'a']))
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage).toMatchObject({ role: 'agent', content: 'aa' })
    expect(lastMessage.streamingError).toBe(false)
  })

  it('não corta o delta que contém o anterior', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/agents/agent-1/runs`, () =>
        sseStream(contentEvents('RunContent', ['a', 'ab', 'c']))
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('aabc')
  })

  it('anexa cada TeamRunContent, inclusive delta igual ao anterior', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/teams/team-1/runs`, () =>
        sseStream(contentEvents('TeamRunContent', ['a', 'a']))
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage).toMatchObject({ role: 'agent', content: 'aa' })
    expect(lastMessage.streamingError).toBe(false)
  })

  it('mantém o RunResponseContent legado como conteúdo acumulado', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/agents/agent-1/runs`, () =>
        sseStream(contentEvents('RunResponseContent', ['a', 'ab']))
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('ab')
  })

  it('o RunCompleted fixa o texto final', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/agents/agent-1/runs`, () =>
        sseStream([
          ...contentEvents('RunContent', ['a', 'a']),
          { event: 'RunCompleted', content: 'final', created_at: 2 }
        ])
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('final')
  })

  // O agno omite do JSON os campos None (agno/run/base.py): delta só de
  // raciocínio, citação ou mídia chega sem `content`.
  it('ignora o RunContent sem content', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/agents/agent-1/runs`, () =>
        sseStream([
          {
            event: 'RunContent',
            reasoning_content: 'pensando',
            content_type: 'str',
            created_at: 1
          },
          ...contentEvents('RunContent', ['oi'])
        ])
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('oi')
  })
})

// O Team do agno repassa os eventos crus dos membros no SSE do team
// (stream_member_events=True por padrão em agno/team/team.py).
describe('useAIChatStreamHandler: eventos de membro no stream do team', () => {
  const memberEvents = [
    ...contentEvents('RunContent', ['membro diz X']),
    { event: 'RunCompleted', content: 'membro diz X', created_at: 2 }
  ]

  it('só os eventos do team escrevem o texto', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/teams/team-1/runs`, () =>
        sseStream([
          ...memberEvents,
          ...contentEvents('TeamRunContent', ['Lider: ', 'resumo'])
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.content).toBe('Lider: resumo')
  })

  it('o TeamRunCompleted fixa o texto final', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/teams/team-1/runs`, () =>
        sseStream([
          ...memberEvents,
          ...contentEvents('TeamRunContent', ['Lider: ', 'resumo']),
          { event: 'TeamRunCompleted', content: 'Lider: final', created_at: 3 }
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.content).toBe('Lider: final')
  })

  // Decisão 0007: o RunCompleted de membro não sobrescreve o texto, mas a mídia
  // dele segue mesclada (o TeamRunCompleted não traz a mídia dos membros).
  it('mantém as imagens do RunCompleted de membro', async () => {
    const image = { url: 'https://img.test/membro.png', revised_prompt: 'x' }
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/teams/team-1/runs`, () =>
        sseStream([
          ...contentEvents('RunContent', ['membro diz X']),
          {
            event: 'RunCompleted',
            content: 'membro diz X',
            images: [image],
            created_at: 2
          },
          ...contentEvents('TeamRunContent', ['Lider: ', 'resumo']),
          { event: 'TeamRunCompleted', content: 'Lider: final', created_at: 3 }
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.content).toBe('Lider: final')
    expect(lastMessage.images).toEqual([image])
  })

  // BUG-P0-06-1: no JSON a barra final vira `\\` antes da aspa que fecha a
  // string; o parser do stream não pode tomar essa aspa por escapada.
  it('não perde o stream após delta terminado em barras pares', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/agents/agent-1/runs`, () =>
        sseStream(contentEvents('RunContent', ['a\\\\', 'b', '\\"c']))
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('a\\\\b\\"c')
  })
})
