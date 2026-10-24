import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { usePlaygroundStore } from '@/store'

import { IntlProvider } from '../helpers/intl'
import { BFF } from '../msw/handlers'
import { server } from '../msw/server'

// QA P2-03: evento hostil no stream (a fronteira zod do useAIResponseStream).
// O BFF repassa o stream cru; Infinity por expoente (`1e999`, JSON válido),
// tipos trocados e bytes partidos não podem chegar ao estado da conversa.
// Complementa streamingError.test.tsx (NaN literal, JSON quebrado).

const initialStoreState = usePlaygroundStore.getState()

const frame = (event: string, data: string) =>
  `event: ${event}\ndata: ${data}\n\n`
const started = frame(
  'RunStarted',
  '{"event":"RunStarted","session_id":"s1","created_at":1}'
)
const completed = (extra = '') =>
  frame(
    'RunCompleted',
    `{"event":"RunCompleted","content":"final","created_at":2${extra}}`
  )

const chunked = (parts: Iterable<Iterable<number>>) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(Uint8Array.from(part))
      controller.close()
    }
  })

const run = async (frames: string[], body?: () => ReadableStream) => {
  server.use(
    http.post(
      `${BFF}/agents/agent-1/runs`,
      () =>
        new HttpResponse(body ? body() : frames.join(''), {
          headers: { 'Content-Type': 'text/event-stream' }
        })
    )
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
  const state = usePlaygroundStore.getState()
  return {
    last: state.messages[state.messages.length - 1],
    error: state.streamingErrorMessage,
    streaming: state.isStreaming
  }
}

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('fronteira do stream', () => {
  it('só o campo ruim cai: duração boa ao lado de tokens 1e999 é mantida', async () => {
    const { last } = await run([
      started,
      completed(',"metrics":{"duration":1.5,"input_tokens":1e999}')
    ])

    expect(last.metrics).toEqual({ duration: 1.5 })
  })

  it('duração da tool e created_at 1e999 viram ausentes, não Infinity', async () => {
    const { last, error } = await run([
      started,
      frame(
        'ToolCallCompleted',
        '{"event":"ToolCallCompleted","tool":{"tool_call_id":"c1","tool_name":"t","metrics":{"duration":1e999}},"created_at":1}'
      ),
      completed(',"created_at":1e999')
    ])

    expect(last.tool_calls).toHaveLength(1)
    expect(last.tool_calls?.[0].metrics?.duration).toBeUndefined()
    expect(Number.isFinite(last.created_at)).toBe(true)
    expect(last).toMatchObject({ content: 'final', streamingError: false })
    expect(error).toBeNull()
  })

  it('`tool` e `tools` que não são objeto/lista não viram chamada de tool', async () => {
    const { last, error } = await run([
      started,
      frame(
        'RunContent',
        '{"event":"RunContent","content":"a","tool":"x","tools":"x","created_at":1}'
      ),
      completed()
    ])

    expect(last.tool_calls).toEqual([])
    expect(last).toMatchObject({ content: 'final', streamingError: false })
    expect(error).toBeNull()
  })

  it('1 byte por pedaço, com UTF-8 multibyte e métricas: o evento é remontado inteiro', async () => {
    const text = 'olá 日本語 🚀'
    const bytes = new TextEncoder().encode(
      started +
        frame(
          'RunCompleted',
          `{"event":"RunCompleted","content":${JSON.stringify(text)},"created_at":2,"metrics":{"duration":1.5}}`
        )
    )

    const { last, error } = await run([], () =>
      chunked(Array.from(bytes, (b) => [b]))
    )

    expect(last).toMatchObject({ content: text, metrics: { duration: 1.5 } })
    expect(error).toBeNull()
  })

  it('falha no handler não prende o composer', async () => {
    const { last, streaming } = await run([
      started,
      frame(
        'ReasoningStep',
        '{"event":"ReasoningStep","extra_data":{"reasoning_steps":5},"created_at":1}'
      ),
      completed()
    ])

    expect(streaming).toBe(false)
    expect(last.streamingError).toBe(true)
  })
})
