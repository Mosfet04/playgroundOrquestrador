import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { usePlaygroundStore } from '@/store'

import { AGENTOS_URL } from '../msw/handlers'
import { server } from '../msw/server'
import { IntlProvider } from '../helpers/intl'

// P1-04b: o store guarda o tipo do erro do stream ({ kind, detail? }), e a
// bolha o traduz ao renderizar. O `detail` só leva o texto do orquestrador
// (content do RunError, detail da resposta HTTP); exceção de JS não vai à UI.

const initialStoreState = usePlaygroundStore.getState()

const sse = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )

const externalHandlers = [
  http.get('https://api.ipify.org', () => HttpResponse.json({ ip: '203.0.113.1' })),
  http.get('https://m1.openfpcdn.io/*', () => new HttpResponse(null))
]

const send = async (searchParams: string, mode: 'agent' | 'team' = 'agent') => {
  usePlaygroundStore.setState({ mode, selectedEndpoint: AGENTOS_URL })
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
  server.use(...externalHandlers, http.post(`${AGENTOS_URL}/agents/agent-1/runs`, resolver))

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

  it('TeamRunCancelled: tipo cancelled', async () => {
    server.use(
      ...externalHandlers,
      http.post(`${AGENTOS_URL}/teams/team-1/runs`, () =>
        sse([{ event: 'TeamRunCancelled', created_at: 1 }])
      )
    )

    expect((await send('?team=team-1', 'team')).error).toEqual({ kind: 'cancelled' })
  })

  it('resposta HTTP de erro: o detail do orquestrador vai como dado', async () => {
    runAgentWith(() => HttpResponse.json({ detail: 'Agent not found' }, { status: 404 }))

    expect((await send('?agent=agent-1')).error).toEqual({
      kind: 'runError',
      detail: 'Agent not found'
    })
  })

  it('resposta HTTP de erro com detail que não é texto (422 do FastAPI): runError sem detalhe', async () => {
    runAgentWith(() =>
      HttpResponse.json({ detail: [{ loc: ['body'], msg: 'field required' }] }, { status: 422 })
    )

    expect((await send('?agent=agent-1')).error).toEqual({ kind: 'runError' })
  })

  it('resposta HTTP de erro sem JSON (500 em HTML): runError sem detalhe', async () => {
    runAgentWith(() => HttpResponse.html('<h1>Internal Server Error</h1>', { status: 500 }))

    expect((await send('?agent=agent-1')).error).toEqual({ kind: 'runError' })
  })

  it('falha de rede: tipo network, sem a mensagem da exceção', async () => {
    runAgentWith(() => HttpResponse.error())

    const { last, error } = await send('?agent=agent-1')

    expect(last.streamingError).toBe(true)
    expect(error).toEqual({ kind: 'network' })
  })
})
