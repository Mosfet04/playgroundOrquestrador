import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { usePlaygroundStore } from '@/store'

import { BFF } from '../msw/handlers'
import { server } from '../msw/server'
import { IntlProvider } from '../helpers/intl'

// P1-04b: o store guarda o tipo do erro do stream ({ kind, detail? }), e a
// bolha o traduz ao renderizar. O `detail` só leva o content do RunError
// (o BFF não ecoa o corpo HTTP, P2-03); exceção de JS não vai à UI.

const initialStoreState = usePlaygroundStore.getState()

const sse = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )

const send = async (searchParams: string, mode: 'agent' | 'team' = 'agent') => {
  usePlaygroundStore.setState({ mode })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <IntlProvider>
      <NuqsTestingAdapter searchParams={searchParams}>{children}</NuqsTestingAdapter>
    </IntlProvider>
  )
  const { result } = renderHook(() => useAIChatStreamHandler(), { wrapper })
  await act(() => result.current.handleStreamResponse('oi'))
  const { messages, streamingErrorMessage } = usePlaygroundStore.getState()
  return { last: messages[messages.length - 1], error: streamingErrorMessage }
}

const runAgentWith = (resolver: Parameters<typeof http.post>[1]) =>
  server.use(http.post(`${BFF}/agents/agent-1/runs`, resolver))

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('erro do stream no store', () => {
  it('sem agente nem team: tipo noEntity, sem texto', async () => {
    const { last, error } = await send('')

    expect(last.streamingError).toBe(true)
    expect(error).toEqual({ kind: 'noEntity' })
  })

  it('RunError sem content: tipo runError, sem detalhe', async () => {
    runAgentWith(() => sse([{ event: 'RunError', created_at: 1 }]))

    expect((await send('?agent=agent-1')).error).toEqual({ kind: 'runError' })
  })

  // R4 (review P2-03): o agno 2.5 também encerra o run do agente com
  // RunCancelled; é cancelado, não "interrompido".
  it('RunCancelled: tipo cancelled, não interrupted', async () => {
    runAgentWith(() =>
      sse([
        { event: 'RunContent', content: 'parcial', created_at: 1 },
        { event: 'RunCancelled', created_at: 2 }
      ])
    )

    expect((await send('?agent=agent-1')).error).toEqual({ kind: 'cancelled' })
  })

  it('TeamRunCancelled: tipo cancelled', async () => {
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sse([{ event: 'TeamRunCancelled', created_at: 1 }])
      )
    )

    expect((await send('?team=team-1', 'team')).error).toEqual({ kind: 'cancelled' })
  })

  // P2-03: o BFF não ecoa o corpo do orquestrador; o tipo vem do status.
  it.each([
    [404, 'runError'],
    [502, 'runError'],
    [503, 'unavailable'],
    [504, 'unavailable']
  ])('BFF %i: tipo %s, sem detalhe', async (status, kind) => {
    runAgentWith(() => HttpResponse.json({ success: false, error: 'x', detail: 'eco' }, { status }))

    expect((await send('?agent=agent-1')).error).toEqual({ kind })
  })

  it('stream que acaba sem o RunCompleted: o texto parcial fica e o tipo é interrupted', async () => {
    runAgentWith(() =>
      sse([
        { event: 'RunStarted', session_id: 's1', created_at: 1 },
        { event: 'RunContent', content: 'parcial', created_at: 1 }
      ])
    )

    const { last, error } = await send('?agent=agent-1')

    expect(last).toMatchObject({ content: 'parcial', streamingError: true })
    expect(error).toEqual({ kind: 'interrupted' })
  })

  // R1 (review P2-03): o agno serializa com allow_nan (NaN, Infinity) e um
  // objeto que o JSON.parse recusa não pode travar o resto do stream.
  it.each([
    ['NaN nas métricas', '{"event":"RunContent","content":"x","metrics":{"duration":NaN},"created_at":1}'],
    ['vírgula sobrando', '{"event":"RunContent","content":"x",}']
  ])('JSON inválido (%s) é descartado e os eventos seguintes chegam', async (_, broken) => {
    runAgentWith(
      () =>
        new HttpResponse(
          [
            'event: RunStarted\ndata: {"event":"RunStarted","session_id":"s1","created_at":1}\n\n',
            `event: RunContent\ndata: ${broken}\n\n`,
            'event: RunContent\ndata: {"event":"RunContent","content":"ok","created_at":1}\n\n',
            'event: RunCompleted\ndata: {"event":"RunCompleted","content":"final","created_at":2,"metrics":{"duration":1.5}}\n\n'
          ].join(''),
          { headers: { 'Content-Type': 'text/event-stream' } }
        )
    )

    const { last, error } = await send('?agent=agent-1')

    expect(last).toMatchObject({ content: 'final', streamingError: false, metrics: { duration: 1.5 } })
    expect(error).toBeNull()
  })

  it('evento malformado (sem `event`, JSON quebrado) é descartado e a conversa segue', async () => {
    runAgentWith(
      () =>
        new HttpResponse(
          [
            'data: {"content":"sem tipo"}\n\n',
            'event: RunContent\ndata: {"event":"RunContent","content":"ok","created_at":"ontem"}\n\n',
            'event: RunCompleted\ndata: {"event":"RunCompleted","content":"ok","created_at":2}\n\n'
          ].join(''),
          { headers: { 'Content-Type': 'text/event-stream' } }
        )
    )

    const { last, error } = await send('?agent=agent-1')

    expect(last).toMatchObject({ content: 'ok', streamingError: false })
    expect(error).toBeNull()
  })

  it('falha de rede: tipo network, sem a mensagem da exceção', async () => {
    runAgentWith(() => HttpResponse.error())

    const { last, error } = await send('?agent=agent-1')

    expect(last.streamingError).toBe(true)
    expect(error).toEqual({ kind: 'network' })
  })

  it('401: login com a URL atual, sem bolha de erro', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', {
      href: 'http://localhost:3000/playground?agent=agent-1',
      pathname: '/playground',
      search: '?agent=agent-1',
      assign
    })
    runAgentWith(() => HttpResponse.json({ success: false, error: 'unauthorized' }, { status: 401 }))
    usePlaygroundStore.setState({ mode: 'agent' })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <IntlProvider>
        <NuqsTestingAdapter searchParams="?agent=agent-1">{children}</NuqsTestingAdapter>
      </IntlProvider>
    )
    const { result } = renderHook(() => useAIChatStreamHandler(), { wrapper })

    // Sem act: a promessa não resolve (a página está indo para o login).
    void result.current.handleStreamResponse('oi')

    await vi.waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        `/login?reason=expired&next=${encodeURIComponent('/playground?agent=agent-1')}`
      )
    )
    const { messages, streamingErrorMessage } = usePlaygroundStore.getState()
    expect(messages.some((message) => message.streamingError)).toBe(false)
    expect(streamingErrorMessage).toBeNull()
    vi.unstubAllGlobals()
  })
})
