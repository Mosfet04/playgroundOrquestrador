import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import Messages from '@/components/playground/ChatArea/Messages/Messages'
import Videos from '@/components/playground/ChatArea/Messages/Multimedia/Videos'
import SessionItem from '@/components/playground/Sidebar/Sessions/SessionItem'
import Sidebar from '@/components/playground/Sidebar/Sidebar'
import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import useChatActions from '@/hooks/useChatActions'
import { usePlaygroundStore } from '@/store'

import { IntlProvider, renderWithIntl } from '../helpers/intl'
import { AGENTOS_URL } from '../msw/handlers'
import { server } from '../msw/server'

// QA do P1-04b: o que o PlaygroundI18n.test.tsx e o streamingError.test.tsx
// não cobrem. O toast de agentes (BUG-P1-04b-1, corrigido), os toasts
// do vídeo e da exclusão por rede, o detalhe hostil do orquestrador, o stream
// interrompido e o teclado do endpoint.

const initialStoreState = usePlaygroundStore.getState()

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  window.matchMedia = (query: string) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined
    }) as unknown as MediaQueryList
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('toast de falha ao carregar agentes', () => {
  // BUG-P1-04b-1 (MINOR, corrigido pela D-P1-04b-2, decisão 0012): o
  // src/api/playground.ts disparava um toast em inglês fixo e devolvia [].
  // Agora o erro sobe e o hook avisa com a frase do catálogo.
  it('/agents com 500 avisa em pt-BR, não em inglês fixo', async () => {
    usePlaygroundStore.setState({ selectedEndpoint: AGENTOS_URL })
    server.use(
      http.get(`${AGENTOS_URL}/agents`, () => new HttpResponse(null, { status: 500 }))
    )
    const wrapper = ({ children }: { children: ReactNode }) => (
      <IntlProvider>
        <NuqsTestingAdapter searchParams="?agent=agent-1">
          {children}
          <Toaster />
        </NuqsTestingAdapter>
      </IntlProvider>
    )
    const { result } = renderHook(() => useChatActions(), { wrapper })

    await act(() => result.current.getAgents())

    expect(await screen.findByText('Não foi possível carregar os agentes')).toBeInTheDocument()
  })
})

describe('toasts de mídia e de exclusão', () => {
  const MEDIA = 'http://media.test/v.mp4'

  it.each([
    ['pt-BR', 'Baixar vídeo', 'Não foi possível baixar o vídeo'],
    ['en', 'Download video', "Couldn't download the video"]
  ] as const)('%s: download de vídeo que falha', async (locale, button, message) => {
    server.use(http.get(MEDIA, () => new HttpResponse(null, { status: 404 })))
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <Videos videos={[{ id: 1, url: MEDIA, eta: 0 }]} />
        <Toaster />
      </>,
      { locale }
    )

    await user.click(screen.getByRole('button', { name: button }))

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it('exclusão que cai na rede: só a frase, sem código nem a mensagem da exceção', async () => {
    server.use(http.delete(`${AGENTOS_URL}/sessions/:id`, () => HttpResponse.error()))
    usePlaygroundStore.setState({
      selectedEndpoint: AGENTOS_URL,
      mode: 'agent',
      sessionsData: [{ session_id: 's1', title: 'Minha sessão', created_at: 1 }]
    })
    const user = userEvent.setup()
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        <SessionItem
          session_id="s1"
          title="Minha sessão"
          created_at={1}
          isSelected={false}
          currentSessionId={null}
          onSessionClick={() => undefined}
        />
        <Toaster />
      </NuqsTestingAdapter>
    )

    await user.click(screen.getByRole('button', { name: 'Excluir sessão "Minha sessão"' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText('Não foi possível excluir a sessão')).toBeInTheDocument()
    expect(screen.queryByText(/código|Failed to fetch|TypeError/)).not.toBeInTheDocument()
  })
})

describe('bolha de erro com entrada hostil', () => {
  it('o detail do orquestrador é texto: HTML e markdown não viram elemento', () => {
    const detail = '<img src=x onerror=alert(1)> <script>alert(2)</script> **negrito** [x](javascript:alert(3))'
    usePlaygroundStore.setState({ streamingErrorMessage: { kind: 'runError', detail } })

    const { container } = renderWithIntl(
      <Messages messages={[{ role: 'agent', content: '', streamingError: true, created_at: 1 }]} />
    )

    expect(screen.getByText(new RegExp(detail.replace(/[()*[\]]/g, '\\$&')))).toBeInTheDocument()
    expect(container.querySelector('img, script, strong, a, [onerror]')).toBeNull()
  })
})

describe('stream interrompido no meio', () => {
  it('mantém o texto parcial e marca o erro de rede, sem a mensagem da exceção', async () => {
    const encoder = new TextEncoder()
    const chunk = {
      event: 'RunContent',
      content: 'parcial',
      created_at: 1,
      session_id: 's1'
    }
    server.use(
      http.get('https://api.ipify.org', () => HttpResponse.json({ ip: '203.0.113.1' })),
      http.get('https://m1.openfpcdn.io/*', () => new HttpResponse(null)),
      http.post(
        `${AGENTOS_URL}/agents/agent-1/runs`,
        () =>
          new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  encoder.encode(`event: RunContent\ndata: ${JSON.stringify(chunk)}\n\n`)
                )
                controller.error(new Error('conexão caiu: segredo-interno'))
              }
            }),
            { headers: { 'Content-Type': 'text/event-stream' } }
          )
      )
    )
    usePlaygroundStore.setState({ mode: 'agent', selectedEndpoint: AGENTOS_URL })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <IntlProvider>
        <NuqsTestingAdapter searchParams="?agent=agent-1">{children}</NuqsTestingAdapter>
      </IntlProvider>
    )
    const { result } = renderHook(() => useAIChatStreamHandler(), { wrapper })

    await act(() => result.current.handleStreamResponse('oi'))

    const { messages, streamingErrorMessage, isStreaming } = usePlaygroundStore.getState()
    expect(streamingErrorMessage).toEqual({ kind: 'network' })
    expect(JSON.stringify(streamingErrorMessage)).not.toContain('segredo-interno')
    expect(messages[messages.length - 1].streamingError).toBe(true)
    expect(isStreaming).toBe(false)
  })
})

describe('endpoint pelo teclado', () => {
  it('Espaço também abre a edição, e o botão fica na ordem de foco', async () => {
    const user = userEvent.setup()
    usePlaygroundStore.setState({ hydrated: true })
    render(
      <IntlProvider>
        <NuqsTestingAdapter>
          <Sidebar />
        </NuqsTestingAdapter>
      </IntlProvider>
    )

    // P1-06: botão nativo (na ordem de foco sem tabindex).
    const edit = screen.getByRole('button', { name: 'Editar endpoint' })
    expect(edit.tagName).toBe('BUTTON')
    edit.focus()
    await user.keyboard(' ')

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar endpoint' })).toBeInTheDocument()
  })
})
