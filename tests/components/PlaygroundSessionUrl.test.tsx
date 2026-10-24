import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
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
