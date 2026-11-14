import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import { AppShell } from '@/components/layout/AppShell'
import { usePlaygroundStore } from '@/store'

import { BFF, agentsFixture } from '../msw/handlers'
import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// Critério 3 do P1-03: ?agent= e ?session= continuam valendo em /playground.
// A carga da sessão da URL mudou de lugar (Sessions -> ChatArea, deps
// [hydrated]); aqui o contrato visto pelo usuário, inclusive quando o
// orquestrador está fora ao abrir a página (R6 do review).

vi.mock('next/navigation', () => ({ usePathname: () => '/playground' }))

const initialStoreState = usePlaygroundStore.getState()
const sessionRequests = { count: 0 }

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

const history = {
  success: true,
  data: {
    chat_history: [
      { role: 'user', content: 'Pergunta do histórico', created_at: 1 },
      { role: 'assistant', content: 'Resposta do histórico', created_at: 2 }
    ]
  }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
  usePlaygroundStore.setState(initialStoreState, true)
    sessionRequests.count = 0
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const renderPlayground = () =>
  renderWithIntl(
    <NuqsAdapter>
      <AppShell>
        <PlaygroundPage />
      </AppShell>
    </NuqsAdapter>
  )

describe('/playground com ?agent= e ?session=', () => {
  it('abre com o agente selecionado e as mensagens da sessão', async () => {
    server.use(http.get(`${BFF}/sessions/:id`, () => HttpResponse.json(history)))
    renderPlayground()

    expect(await screen.findByText('Resposta do histórico')).toBeInTheDocument()
    expect(screen.getByText('Pergunta do histórico')).toBeInTheDocument()
    expect(window.location.search).toContain('agent=agent-1')
    expect(window.location.search).toContain('session=session-a1')
  })

  it('sessão inexistente (404): sem mensagens e sem quebrar a página', async () => {
    server.use(
      http.get(`${BFF}/sessions/:id`, () =>
        HttpResponse.json({ detail: 'not found' }, { status: 404 })
      )
    )
    renderPlayground()

    expect(await screen.findByText('Sessões')).toBeInTheDocument()
    expect(screen.queryByText('Resposta do histórico')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  // LIM-P1-03-1 (corrigida no P1-06, D-P1-06-4): com o orquestrador fora ao
  // abrir, ?agent= e ?session= ficam na URL e a sessão carrega quando o
  // endpoint volta.
  it(
    'LIM-P1-03-1: orquestrador fora ao abrir; ao voltar e tentar de novo, as mensagens da sessão da URL aparecem',
    async () => {
      const user = userEvent.setup()
      let online = false
      server.use(
        http.get(`${BFF}/agents`, () =>
          online
            ? HttpResponse.json({ success: true, data: agentsFixture })
            : HttpResponse.json({ success: false, error: 'unreachable' }, { status: 503 })
        ),
        http.get(`${BFF}/sessions/:id`, () => {
          sessionRequests.count += 1
          return online
            ? HttpResponse.json(history)
            : new HttpResponse(null, { status: 500 })
        })
      )
      renderPlayground()
      await waitFor(() =>
        expect(usePlaygroundStore.getState().isOrchestratorLoading).toBe(false)
      )
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
      expect(screen.queryByText('Resposta do histórico')).not.toBeInTheDocument()

      online = true
      await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

      expect(await screen.findByText('Sessões', {}, { timeout: 2000 })).toBeInTheDocument()
      await waitFor(() => expect(window.location.search).toContain('session=session-a1'))
      expect(
        await screen.findByText('Resposta do histórico', {}, { timeout: 1500 })
      ).toBeInTheDocument()
    }
  )
})

// P4-03: "Testar agora" abre /playground?agent=<id> por navegação client-side,
// sem recarregar a página: o store sobrevive à visita anterior e a conversa
// que ele guarda não pode aparecer numa URL sem ?session=.
describe('/playground com ?agent= e sem ?session=', () => {
  it('abre com a conversa vazia, sem as mensagens de uma visita anterior', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    usePlaygroundStore.setState({
      messages: [
        { role: 'user', content: 'Pergunta da visita anterior', created_at: 1 },
        { role: 'agent', content: 'Resposta da visita anterior', created_at: 2 }
      ]
    })
    renderPlayground()

    expect(await screen.findByRole('heading', { name: /^Converse com/ })).toBeInTheDocument()
    expect(screen.queryByText('Resposta da visita anterior')).not.toBeInTheDocument()
    expect(screen.queryByText('Pergunta da visita anterior')).not.toBeInTheDocument()
    expect(window.location.search).not.toContain('session')
  })

  // Clicar em "Playground" na navegação, já em /playground?agent=a&session=X,
  // não remonta a página: a URL perde o ?session= e a conversa X não fica.
  it('a URL perde o ?session= sem a página remontar: a conversa some', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
    server.use(http.get(`${BFF}/sessions/:id`, () => HttpResponse.json(history)))
    renderPlayground()
    expect(await screen.findByText('Resposta do histórico')).toBeInTheDocument()

    await act(async () => {
      window.history.pushState(null, '', '/playground?agent=agent-1')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    await waitFor(() => expect(screen.queryByText('Resposta do histórico')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: /^Converse com/ })).toBeInTheDocument()
  })

  // BUG-P4-03-QA-1: Voltar/Avançar para ?session=X depois do esvaziamento (ou
  // entre duas sessões) tem de trazer a conversa da sessão da URL.
  const goTo = (url: string) =>
    act(async () => {
      window.history.pushState(null, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
  const historyOf = (name: string) => ({
    success: true,
    data: {
      chat_history: [
        { role: 'user', content: `Pergunta ${name}`, created_at: 1 },
        { role: 'assistant', content: `Resposta ${name}`, created_at: 2 }
      ]
    }
  })

  it('X -> sem sessão -> de volta a X: a conversa de X reaparece', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
    server.use(http.get(`${BFF}/sessions/:id`, () => HttpResponse.json(history)))
    renderPlayground()
    expect(await screen.findByText('Resposta do histórico')).toBeInTheDocument()

    await goTo('/playground?agent=agent-1')
    await waitFor(() => expect(screen.queryByText('Resposta do histórico')).not.toBeInTheDocument())
    await goTo('/playground?agent=agent-1&session=session-a1')

    expect(await screen.findByText('Resposta do histórico')).toBeInTheDocument()
  })

  it('X -> Y pelo histórico do navegador: a conversa de Y', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
    server.use(
      http.get(`${BFF}/sessions/:id`, ({ params }) =>
        HttpResponse.json(historyOf(params.id === 'session-a1' ? 'A' : 'B'))
      )
    )
    renderPlayground()
    expect(await screen.findByText('Resposta A')).toBeInTheDocument()

    await goTo('/playground?agent=agent-1&session=session-b2')

    expect(await screen.findByText('Resposta B')).toBeInTheDocument()
    expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
  })

  it('clicar numa sessão da lista carrega o histórico uma vez só', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    const loads: string[] = []
    server.use(
      http.get(`${BFF}/sessions/:id`, ({ params }) => {
        loads.push(String(params.id))
        return HttpResponse.json(history)
      })
    )
    renderPlayground()

    const [item] = await screen.findAllByRole('button', { name: /Primeira conversa/ })
    await userEvent.setup().click(item)

    expect(await screen.findByText('Resposta do histórico')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toContain('session=session-a1'))
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(loads).toEqual(['session-a1'])
  })

  it('clicar numa sessão cujo GET falha: a URL vai para ela, como antes', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    server.use(http.get(`${BFF}/sessions/:id`, () => new HttpResponse(null, { status: 500 })))
    renderPlayground()

    const [item] = await screen.findAllByRole('button', { name: /Primeira conversa/ })
    await userEvent.setup().click(item)

    await waitFor(() => expect(window.location.search).toContain('session=session-a1'))
  })

  // Resposta lenta de uma sessão que a URL já deixou: não pode escrever na
  // conversa de agora.
  describe('resposta atrasada do histórico', () => {
    const slow = (ms: Record<string, number>) =>
      server.use(
        http.get(`${BFF}/sessions/:id`, async ({ params }) => {
          await delay(ms[String(params.id)] ?? 0)
          return HttpResponse.json(historyOf(params.id === 'session-a1' ? 'A' : 'B'))
        })
      )
    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)))

    it('a URL perde a sessão antes da resposta: a conversa fica vazia', async () => {
      window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
      slow({ 'session-a1': 250 })
      renderPlayground()
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

      await goTo('/playground?agent=agent-1')
      await settle()

      expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^Converse com/ })).toBeInTheDocument()
    })

    it('X -> Y com as respostas fora de ordem: só a de Y', async () => {
      window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
      slow({ 'session-a1': 250, 'session-b2': 0 })
      renderPlayground()
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

      await goTo('/playground?agent=agent-1&session=session-b2')
      await settle()

      expect(screen.getByText('Resposta B')).toBeInTheDocument()
      expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
    })

    it('a página desmonta antes da resposta: ao voltar sem sessão, nada da conversa antiga', async () => {
      window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
      slow({ 'session-a1': 250 })
      const first = renderPlayground()
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
      first.unmount()

      window.history.replaceState(null, '', '/playground?agent=agent-1')
      renderPlayground()
      await settle()

      expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
    })

    it('voltar a ?session=X depois de sair da página lê o histórico do servidor de novo', async () => {
      window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
      const loads: string[] = []
      server.use(
        http.get(`${BFF}/sessions/:id`, ({ params }) => {
          loads.push(String(params.id))
          return HttpResponse.json(historyOf('A'))
        })
      )
      const first = renderPlayground()
      expect(await screen.findByText('Resposta A')).toBeInTheDocument()
      first.unmount()

      renderPlayground()

      await waitFor(() => expect(loads).toEqual(['session-a1', 'session-a1']))
    })
  })
})
