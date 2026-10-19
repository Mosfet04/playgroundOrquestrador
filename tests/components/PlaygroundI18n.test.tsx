import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { Toaster } from 'sonner'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import ChatBlankState from '@/components/playground/ChatArea/Messages/ChatBlankState'
import Messages from '@/components/playground/ChatArea/Messages/Messages'
import Videos from '@/components/playground/ChatArea/Messages/Multimedia/Videos'
import SessionBlankState from '@/components/playground/Sidebar/Sessions/SessionBlankState'
import SessionItem from '@/components/playground/Sidebar/Sessions/SessionItem'
import Sidebar from '@/components/playground/Sidebar/Sidebar'
import type { AppLocale } from '@/i18n/locales'
import useSessionLoader from '@/hooks/useSessionLoader'
import { usePlaygroundStore } from '@/store'
import type { PlaygroundChatMessage } from '@/types/playground'

import { AGENTOS_URL } from '../msw/handlers'
import { server } from '../msw/server'
import { IntlProvider, renderWithIntl } from '../helpers/intl'

// P1-04b: o /playground nos dois idiomas, e a troca de idioma sem desmontar
// nada (sem recarga, composer e stream intactos).

vi.mock('next/navigation', () => ({ usePathname: () => '/playground' }))

const initialStoreState = usePlaygroundStore.getState()

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.scrollIntoView = () => undefined
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
})

const errorBubble: PlaygroundChatMessage = {
  role: 'agent',
  content: '',
  streamingError: true,
  created_at: 2
}

describe('troca de idioma com a conversa aberta', () => {
  const requests: string[] = []
  const countOf = (path: string) => requests.filter((entry) => entry === `GET ${path}`).length

  beforeEach(() => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
    usePlaygroundStore.setState({ selectedEndpoint: AGENTOS_URL, hydrated: true })
    requests.length = 0
    server.events.on('request:start', ({ request }) => {
      requests.push(`${request.method} ${new URL(request.url).pathname}`)
    })
    server.use(
      http.get(`${AGENTOS_URL}/sessions/:id`, () =>
        HttpResponse.json({
          session_id: 'session-a1',
          chat_history: [
            { role: 'user', content: 'Pergunta do histórico', created_at: 1 },
            { role: 'assistant', content: 'Resposta do histórico', created_at: 2 }
          ]
        })
      )
    )
  })

  afterEach(() => {
    server.events.removeAllListeners('request:start')
    window.history.replaceState(null, '', '/')
  })

  const page = (locale: AppLocale) => (
    <IntlProvider locale={locale}>
      <NuqsAdapter>
        <PlaygroundPage />
      </NuqsAdapter>
    </IntlProvider>
  )

  it('troca os rótulos e mantém mensagens, stream, composer e a carga feita', async () => {
    const user = userEvent.setup()
    const { rerender } = render(page('pt-BR'))

    expect(await screen.findByText('Resposta do histórico')).toBeInTheDocument()
    await waitFor(() => expect(countOf('/sessions')).toBe(1))
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeInTheDocument()
    expect(screen.getByText('Sessões')).toHaveClass('uppercase')
    const composer = screen.getByPlaceholderText('Escreva uma mensagem para Assistente')
    await user.type(composer, 'rascunho')
    act(() =>
      usePlaygroundStore.getState().setMessages((messages) => [
        ...messages,
        { role: 'user', content: 'Pergunta nova', created_at: 3 },
        { role: 'agent', content: 'Resposta parcial', created_at: 4 }
      ])
    )
    const loads = ['/status', '/agents', '/sessions', '/sessions/session-a1'].map(countOf)

    rerender(page('en'))

    expect(screen.getByText('New chat')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write a message to Assistente')).toBe(composer)
    expect(composer).toHaveValue('rascunho')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
    expect(screen.getByText('Resposta parcial')).toBeInTheDocument()
    // Dá vez aos efeitos e ao MSW de uma eventual recarga.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(['/status', '/agents', '/sessions', '/sessions/session-a1'].map(countOf)).toEqual(
      loads
    )
    expect(window.location.search).toContain('agent=agent-1')
    expect(window.location.search).toContain('session=session-a1')
  })
})

describe('bolha de erro do stream', () => {
  const bubble = (locale: AppLocale) => (
    <IntlProvider locale={locale}>
      <Messages messages={[errorBubble]} />
    </IntlProvider>
  )

  it('traduz o tipo ao renderizar e mostra o detalhe do orquestrador sem tradução', () => {
    usePlaygroundStore.setState({
      streamingErrorMessage: { kind: 'runError', detail: 'modelo caiu' }
    })
    const { rerender } = render(bubble('pt-BR'))

    expect(
      screen.getByText('Algo deu errado durante a resposta. Erro durante a execução. modelo caiu')
    ).toBeInTheDocument()

    rerender(bubble('en'))

    expect(
      screen.getByText('Something went wrong during the response. Error during the run. modelo caiu')
    ).toBeInTheDocument()
  })

  it.each([
    [{ kind: 'noEntity' as const }, 'Selecione um agente ou team antes de enviar.'],
    [{ kind: 'cancelled' as const }, 'Execução cancelada.'],
    [{ kind: 'network' as const }, 'Sem resposta do endpoint.'],
    [null, 'Recarregue a página ou tente de novo mais tarde.']
  ])('%o: frase do meio', (error, phrase) => {
    usePlaygroundStore.setState({ streamingErrorMessage: error })
    render(bubble('pt-BR'))

    expect(
      screen.getByText(`Algo deu errado durante a resposta. ${phrase}`)
    ).toBeInTheDocument()
  })
})

describe('textos do chat', () => {
  it('passos do raciocínio em caixa alta e chat vazio, nos dois idiomas', () => {
    const message: PlaygroundChatMessage = {
      role: 'agent',
      content: 'ok',
      created_at: 1,
      extra_data: { reasoning_steps: [{ title: 'Ler a pergunta', result: '', reasoning: '' }] }
    }
    const { unmount } = renderWithIntl(<Messages messages={[message]} />)
    expect(screen.getByText('Raciocínio')).toBeInTheDocument()
    expect(screen.getByText('Passo 1')).toHaveClass('uppercase')
    unmount()

    renderWithIntl(<Messages messages={[message]} />, { locale: 'en' })
    expect(screen.getByText('Step 1')).toBeInTheDocument()
  })

  it('chat vazio traduzido e sem o texto nem os links da Agno (P1-05)', () => {
    usePlaygroundStore.setState({
      isEndpointLoading: false,
      isEndpointActive: true,
      agents: [{ value: 'agent-1', label: 'Assistente', model: { provider: 'OpenAI' } }]
    })
    const { unmount } = renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        <ChatBlankState />
      </NuqsTestingAdapter>
    )
    expect(screen.getByRole('heading', { name: 'Converse com Assistente' })).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(/Agno|Agent UI/)).not.toBeInTheDocument()
    unmount()

    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        <ChatBlankState />
      </NuqsTestingAdapter>,
      { locale: 'en' }
    )
    expect(screen.getByRole('heading', { name: 'Chat with Assistente' })).toBeInTheDocument()
  })

  it('botão de baixar vídeo tem nome acessível', () => {
    renderWithIntl(<Videos videos={[{ id: 1, url: 'https://x.test/v.mp4', eta: 0 }]} />, {
      locale: 'en'
    })

    expect(screen.getByRole('button', { name: 'Download video' })).toBeInTheDocument()
  })
})

describe('sessões', () => {
  const blank = (searchParams: string) =>
    renderWithIntl(
      <NuqsTestingAdapter searchParams={searchParams}>
        <SessionBlankState />
      </NuqsTestingAdapter>
    )

  it('endpoint desconectado', () => {
    usePlaygroundStore.setState({ isEndpointActive: false })
    blank('?agent=agent-1')

    expect(
      screen.getByText('Endpoint desconectado. Conecte o endpoint para ver o histórico.')
    ).toBeInTheDocument()
  })

  it('sem agente', () => {
    usePlaygroundStore.setState({ isEndpointActive: true })
    blank('')

    expect(screen.getByText('Selecione um agente para ver o histórico.')).toBeInTheDocument()
  })

  it('sem storage, com o link "storage"', () => {
    usePlaygroundStore.setState({ isEndpointActive: true, hasStorage: false })
    blank('?agent=agent-1')

    const link = screen.getByRole('link', { name: 'storage' })
    expect(link.parentElement).toHaveTextContent(
      'Conecte um storage ao agente para ver as sessões.'
    )
  })

  it('sem sessões', () => {
    usePlaygroundStore.setState({ isEndpointActive: true, hasStorage: true })
    blank('?agent=agent-1')

    expect(
      screen.getByText('Nenhuma sessão ainda. Envie uma mensagem para criar uma.')
    ).toBeInTheDocument()
  })

  describe('excluir sessão', () => {
    beforeAll(() => {
      Element.prototype.hasPointerCapture = () => false
      Element.prototype.releasePointerCapture = () => undefined
    })

    const item = () =>
      renderWithIntl(
        <NuqsTestingAdapter searchParams="?agent=agent-1">
          <SessionItem
            session_id="session-a1"
            title="Minha sessão"
            created_at={1}
            isSelected={false}
            currentSessionId={null}
            onSessionClick={() => undefined}
          />
          <Toaster />
        </NuqsTestingAdapter>
      )

    beforeEach(() => {
      usePlaygroundStore.setState({
        selectedEndpoint: AGENTOS_URL,
        mode: 'agent',
        sessionsData: [{ session_id: 'session-a1', title: 'Minha sessão', created_at: 1 }]
      })
    })

    it('lixeira com o título no nome, modal e toast de sucesso traduzidos', async () => {
      server.use(
        http.delete(`${AGENTOS_URL}/sessions/:id`, () => new HttpResponse(null, { status: 204 }))
      )
      const user = userEvent.setup()
      item()

      await user.click(screen.getByRole('button', { name: 'Excluir sessão "Minha sessão"' }))
      const dialog = screen.getByRole('dialog', { name: 'Excluir sessão' })
      expect(dialog).toHaveTextContent(
        'Tem certeza que deseja excluir esta sessão? Esta ação não pode ser desfeita.'
      )
      expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('uppercase')
      await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

      expect(await screen.findByText('Sessão excluída')).toBeInTheDocument()
    })

    it('falha com status: a frase com o código, sem o texto do servidor', async () => {
      server.use(
        http.delete(`${AGENTOS_URL}/sessions/:id`, () =>
          HttpResponse.text('stack interna', { status: 500 })
        )
      )
      const user = userEvent.setup()
      item()

      await user.click(screen.getByRole('button', { name: 'Excluir sessão "Minha sessão"' }))
      await user.click(screen.getByRole('button', { name: 'Excluir' }))

      expect(
        await screen.findByText('Não foi possível excluir a sessão (código 500)')
      ).toBeInTheDocument()
      expect(screen.queryByText(/stack interna/)).not.toBeInTheDocument()
    })
  })
})

// P1-05: a falha vai para a caixa de sessões (com "Tentar de novo"), sem toast.
describe('falha ao carregar sessões (BUG-P1-04b-1)', () => {
  it('marca a falha no store, sem toast, e deixa a lista vazia', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    usePlaygroundStore.setState({ selectedEndpoint: AGENTOS_URL })
    server.use(http.get(`${AGENTOS_URL}/sessions`, () => new HttpResponse(null, { status: 500 })))
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <IntlProvider locale="en">
        {children}
        <Toaster />
      </IntlProvider>
    )
    const { result } = renderHook(() => useSessionLoader(), { wrapper })

    await act(() => result.current.getSessions({ entityType: 'agent', agentId: 'agent-1' }))

    expect(usePlaygroundStore.getState().sessionsError).toBe(true)
    expect(screen.queryByText("Couldn't load sessions")).not.toBeInTheDocument()
    expect(usePlaygroundStore.getState().sessionsData).toEqual([])
  })
})

describe('painel', () => {
  it('botões só com ícone têm nome acessível e URL inválida avisa no idioma', async () => {
    const user = userEvent.setup()
    usePlaygroundStore.setState({ hydrated: true })
    renderWithIntl(
      <NuqsTestingAdapter>
        <Sidebar />
        <Toaster />
      </NuqsTestingAdapter>
    )

    expect(
      screen.getByRole('button', { name: 'Recolher painel de sessões' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Recarregar agentes e sessões' })
    ).toBeInTheDocument()
    // o endpoint abre a edição pelo teclado, com nome acessível (R1) e a URL
    // como descrição (R8), com o status em palavra (P1-05; "conectando" antes
    // do fim da 1ª tentativa, P1-06)
    const edit = screen.getByRole('button', { name: 'Editar endpoint' })
    expect(edit).toHaveAccessibleDescription('http://localhost:7777 conectando')
    edit.focus()
    await user.keyboard('{Enter}')
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'não é url')
    await user.click(screen.getByRole('button', { name: 'Salvar endpoint' }))

    expect(await screen.findByText('Informe uma URL válida')).toBeInTheDocument()
  })
})
