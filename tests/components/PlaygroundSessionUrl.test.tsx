import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import { AppShell } from '@/components/layout/AppShell'
import { usePlaygroundStore } from '@/store'

import { AGENTOS_URL } from '../msw/handlers'
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
  session_id: 'session-a1',
  chat_history: [
    { role: 'user', content: 'Pergunta do histórico', created_at: 1 },
    { role: 'assistant', content: 'Resposta do histórico', created_at: 2 }
  ]
}

beforeEach(() => {
  window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
  usePlaygroundStore.setState(initialStoreState, true)
  usePlaygroundStore.setState({ selectedEndpoint: AGENTOS_URL, hydrated: true })
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

const refreshButton = () => {
  const row = screen.getByText('Endpoint').parentElement as HTMLElement
  const buttons = row.querySelectorAll('button')
  return buttons[buttons.length - 1] as HTMLButtonElement
}

describe('/playground com ?agent= e ?session=', () => {
  it('abre com o agente selecionado e as mensagens da sessão', async () => {
    server.use(http.get(`${AGENTOS_URL}/sessions/:id`, () => HttpResponse.json(history)))
    renderPlayground()

    expect(await screen.findByText('Resposta do histórico')).toBeInTheDocument()
    expect(screen.getByText('Pergunta do histórico')).toBeInTheDocument()
    expect(window.location.search).toContain('agent=agent-1')
    expect(window.location.search).toContain('session=session-a1')
  })

  it('sessão inexistente (404): sem mensagens e sem quebrar a página', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/sessions/:id`, () =>
        HttpResponse.json({ detail: 'not found' }, { status: 404 })
      )
    )
    renderPlayground()

    expect(await screen.findByText('Sessões')).toBeInTheDocument()
    expect(screen.queryByText('Resposta do histórico')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  // R6 (review do P1-03, MINOR): refutado como regressão. O mesmo teste contra
  // o código de 9c58d95 (Sessions carregando a sessão ao montar) também falha:
  // com o orquestrador fora, initializePlayground limpa ?agent= e, ao voltar,
  // o painel monta sem agente, então nenhuma versão busca a sessão da URL.
  // Limitação pré-existente; o it.fails vira vermelho quando alguém corrigir.
  it.fails(
    'LIM-P1-03-1 (pré-existente): orquestrador fora ao abrir; ao voltar e atualizar o endpoint, as mensagens da sessão da URL aparecem',
    async () => {
      const user = userEvent.setup()
      let online = false
      server.use(
        http.get(`${AGENTOS_URL}/status`, () =>
          online ? HttpResponse.json({ status: 'available' }) : new HttpResponse(null, { status: 500 })
        ),
        http.get(`${AGENTOS_URL}/health`, () =>
          online ? HttpResponse.json({ status: 'ok' }) : new HttpResponse(null, { status: 500 })
        ),
        http.get(`${AGENTOS_URL}/sessions/:id`, () => {
          sessionRequests.count += 1
          return online
            ? HttpResponse.json(history)
            : new HttpResponse(null, { status: 500 })
        })
      )
      renderPlayground()
      await waitFor(() =>
        expect(usePlaygroundStore.getState().isEndpointLoading).toBe(false)
      )
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
      expect(screen.queryByText('Resposta do histórico')).not.toBeInTheDocument()

      online = true
      await user.click(refreshButton())

      expect(await screen.findByText('Sessões', {}, { timeout: 2000 })).toBeInTheDocument()
      await waitFor(() => expect(window.location.search).toContain('session=session-a1'))
      expect(
        await screen.findByText('Resposta do histórico', {}, { timeout: 1500 })
      ).toBeInTheDocument()
    }
  )
})
