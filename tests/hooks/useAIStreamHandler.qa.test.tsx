import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { usePlaygroundStore } from '@/store'

import { BFF } from '../msw/handlers'
import { server } from '../msw/server'
import { IntlProvider } from '../helpers/intl'

const initialStoreState = usePlaygroundStore.getState()

const sse = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )

const deltas = (event: string, contents: string[]) =>
  contents.map((content) => ({ event, content, created_at: 1 }))

const run = async (events: Record<string, unknown>[]) => {
  server.use(
    http.post(`${BFF}/agents/agent-1/runs`, () => sse(events))
  )
  usePlaygroundStore.setState({ mode: 'agent' })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <IntlProvider>
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        {children}
      </NuqsTestingAdapter>
    </IntlProvider>
  )
  const { result } = renderHook(() => useAIChatStreamHandler(), { wrapper })
  await act(() => result.current.handleStreamResponse('oi'))
  const { messages, streamingErrorMessage } = usePlaygroundStore.getState()
  return { last: messages[messages.length - 1], streamingErrorMessage }
}

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('useAIChatStreamHandler: QA do stream com deltas', () => {
  it('RunError depois de deltas mantém o texto parcial e marca o erro', async () => {
    const { last, streamingErrorMessage } = await run([
      ...deltas('RunContent', ['par', 'cial']),
      { event: 'RunError', content: 'modelo caiu', created_at: 2 }
    ])

    expect(last.content).toBe('parcial')
    expect(last.streamingError).toBe(true)
    expect(streamingErrorMessage).toEqual({ kind: 'runError', detail: 'modelo caiu' })
  })

  // BUG-P0-06-1 (corrigido no P0-06, decisão 0007 D-P0-06-2): o parser do
  // stream tratava `\"` como aspas escapada mesmo quando a barra era o fim de
  // um `\\`; um delta terminado em barra invertida perdia o resto do stream.
  it('BUG-P0-06-1: delta terminado em barra invertida não perde o resto do stream', async () => {
    const { last } = await run([...deltas('RunContent', ['a\\', 'b', 'c'])])

    expect(last.content).toBe('a\\bc')
  })

  it('delta com aspas e chaves sozinhos não quebra o parse do stream', async () => {
    const { last } = await run(deltas('RunContent', ['"', '{', '}', 'fim']))

    expect(last.content).toBe('"{}fim')
  })
})
