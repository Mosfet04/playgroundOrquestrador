import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import ChatArea from '@/components/playground/ChatArea/ChatArea'
import Sidebar from '@/components/playground/Sidebar/Sidebar'
import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import useChatActions from '@/hooks/useChatActions'
import { usePlaygroundStore } from '@/store'

import { IntlProvider, renderWithIntl } from '../helpers/intl'
import { BFF, agentsFixture } from '../msw/handlers'
import { server } from '../msw/server'

// D-P2-03-4 (decisão 0020): o run em andamento é abortado ao trocar de
// entidade, abrir "Nova conversa" ou sair da página; o abort não vira bolha
// de erro na conversa seguinte.

const initialStoreState = usePlaygroundStore.getState()

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

// Stream que manda um delta e fica aberto até o abort, que é registrado.
const heldRun = () => {
  const aborted = { value: false }
  server.use(
    http.post(`${BFF}/agents/agent-1/runs`, ({ request }) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'event: RunContent\ndata: {"event":"RunContent","content":"parcial","created_at":1}\n\n'
            )
          )
          request.signal.addEventListener('abort', () => {
            aborted.value = true
            controller.error(request.signal.reason)
          })
        }
      })
      return new HttpResponse(stream, {
        headers: { 'Content-Type': 'text/event-stream' }
      })
    })
  )
  return aborted
}

describe('abort do run', () => {
  it('"Nova conversa" (clearChat) aborta o run; sem bolha de erro e sem stream preso', async () => {
    const aborted = heldRun()
    usePlaygroundStore.setState({ mode: 'agent' })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <IntlProvider>
        <NuqsTestingAdapter searchParams="?agent=agent-1">
          {children}
        </NuqsTestingAdapter>
      </IntlProvider>
    )
    const { result } = renderHook(
      () => ({ stream: useAIChatStreamHandler(), actions: useChatActions() }),
      { wrapper }
    )

    let run!: Promise<void>
    act(() => {
      run = result.current.stream.handleStreamResponse('oi')
    })
    await waitFor(() =>
      expect(usePlaygroundStore.getState().messages.at(-1)?.content).toBe(
        'parcial'
      )
    )
    act(() => result.current.actions.clearChat())
    await act(() => run)

    expect(aborted.value).toBe(true)
    const state = usePlaygroundStore.getState()
    expect(state.messages).toEqual([])
    expect(state.streamingErrorMessage).toBeNull()
    expect(state.isStreaming).toBe(false)
    expect(state.runAbortController).toBeNull()
  })

  const withRun = () => {
    const controller = new AbortController()
    usePlaygroundStore.setState({ runAbortController: controller })
    return controller
  }

  it('trocar de agente no cartão aborta o run', async () => {
    usePlaygroundStore.setState({
      isOrchestratorActive: true,
      isOrchestratorLoading: false,
      agents: agentsFixture
    })
    const user = userEvent.setup()
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        <Sidebar />
      </NuqsTestingAdapter>
    )
    const controller = withRun()

    await user.click(
      screen.getByRole('combobox', { name: 'Agente: Assistente' })
    )
    await user.click(await screen.findByRole('option', { name: /Pesquisador/ }))

    expect(controller.signal.aborted).toBe(true)
  })

  it('o botão "Nova conversa" aborta o run', async () => {
    usePlaygroundStore.setState({
      isOrchestratorActive: true,
      isOrchestratorLoading: false,
      agents: agentsFixture,
      messages: [{ role: 'user', content: 'oi', created_at: 1 }]
    })
    const user = userEvent.setup()
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        <Sidebar />
      </NuqsTestingAdapter>
    )
    const controller = withRun()

    await user.click(screen.getByRole('button', { name: 'Nova conversa' }))

    expect(controller.signal.aborted).toBe(true)
  })

  // Adapter de React do nuqs (setter estável, como no Next): com o de testes
  // o efeito de carga do ChatArea entraria em laço (PlaygroundPanel.test).
  it('sair da página (ChatArea desmonta) aborta o run', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    const { unmount } = renderWithIntl(
      <NuqsAdapter>
        <ChatArea />
      </NuqsAdapter>
    )
    await waitFor(() =>
      expect(usePlaygroundStore.getState().isOrchestratorLoading).toBe(false)
    )
    const controller = withRun()

    unmount()

    expect(controller.signal.aborted).toBe(true)
    window.history.replaceState(null, '', '/')
  })

  // R7 (review P2-03): abrir outra sessão no meio do run é troca de conversa.
  it('abrir outra sessão aborta o run e o histórico carregado fica intacto', async () => {
    const aborted = heldRun()
    server.use(
      http.get(`${BFF}/sessions/:id`, () =>
        HttpResponse.json({
          success: true,
          data: {
            chat_history: [
              { role: 'user', content: 'Pergunta B', created_at: 1 },
              { role: 'assistant', content: 'Resposta B', created_at: 2 }
            ]
          }
        })
      )
    )
    usePlaygroundStore.setState({
      mode: 'agent',
      isOrchestratorActive: true,
      isOrchestratorLoading: false,
      hasStorage: true,
      agents: agentsFixture,
      sessionsData: [
        { session_id: 'session-b', title: 'Sessão B', created_at: 1 }
      ]
    })
    let run!: (message: string) => Promise<void>
    const Runner = () => {
      run = useAIChatStreamHandler().handleStreamResponse
      return null
    }
    const user = userEvent.setup()
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        <Sidebar />
        <Runner />
      </NuqsTestingAdapter>
    )

    let pending!: Promise<void>
    act(() => {
      pending = run('oi')
    })
    await waitFor(() =>
      expect(usePlaygroundStore.getState().messages.at(-1)?.content).toBe(
        'parcial'
      )
    )
    await user.click(screen.getByRole('button', { name: /^Sessão B/ }))
    await waitFor(() => expect(aborted.value).toBe(true))
    await act(() => pending)

    const { messages, streamingErrorMessage } = usePlaygroundStore.getState()
    expect(messages.map((message) => message.content)).toEqual([
      'Pergunta B',
      'Resposta B'
    ])
    expect(messages.some((message) => message.streamingError)).toBe(false)
    expect(streamingErrorMessage).toBeNull()
  })

  // Voltar/Avançar entre ?agent= não passa pelo clearChat: a troca de
  // entidade na URL também aborta.
  it('a entidade da URL mudar (Voltar/Avançar) aborta o run', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    renderWithIntl(
      <NuqsAdapter>
        <ChatArea />
      </NuqsAdapter>
    )
    await waitFor(() =>
      expect(usePlaygroundStore.getState().isOrchestratorLoading).toBe(false)
    )
    const controller = withRun()

    act(() => {
      window.history.pushState(null, '', '/playground?agent=agent-2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    await waitFor(() => expect(controller.signal.aborted).toBe(true))
    window.history.replaceState(null, '', '/')
  })
})
