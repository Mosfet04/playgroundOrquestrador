import { act, screen, waitFor, within } from '@testing-library/react'
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

// R1 (review do P1-03): abaixo de lg o painel do playground monta uma 2ª
// Sidebar no Sheet. Ela não pode refazer a carga (status, agentes, sessão):
// isso trocava a mensagem parcial de um stream pelo histórico do servidor.

vi.mock('next/navigation', () => ({ usePathname: () => '/playground' }))

const initialStoreState = usePlaygroundStore.getState()
const requests: string[] = []
const countOf = (path: string) =>
  requests.filter((entry) => entry === `GET ${path}`).length

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
  // Adapter de React do nuqs (lê window.location): o setter é estável, como no
  // adapter do Next. O de testes cria outro a cada render e o efeito de carga,
  // que depende dele, entraria em laço.
  window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-a1')
  usePlaygroundStore.setState(initialStoreState, true)
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

describe('/playground: painel no Sheet', () => {
  it('com ?session=, abrir o painel não recarrega a sessão nem o playground', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <NuqsAdapter>
        <AppShell>
          <PlaygroundPage />
        </AppShell>
      </NuqsAdapter>
    )

    expect(await screen.findByText('Resposta do histórico')).toBeInTheDocument()
    await waitFor(() => expect(countOf('/agents')).toBe(1))
    expect(countOf('/status')).toBe(1)
    expect(countOf('/sessions/session-a1')).toBe(1)

    // Mensagem parcial de um stream em andamento.
    act(() =>
      usePlaygroundStore
        .getState()
        .setMessages((messages) => [
          ...messages,
          { role: 'user', content: 'Pergunta nova', created_at: 3 },
          { role: 'agent', content: 'Resposta parcial', created_at: 4 }
        ])
    )

    await user.click(
      screen.getByRole('button', { name: 'Abrir sessões e agente' })
    )
    const panel = screen.getByRole('dialog', { name: 'Sessões e agente' })
    expect(await within(panel).findByText('Sessions')).toBeInTheDocument()
    // Dá vez aos efeitos e às respostas do MSW de uma eventual recarga.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    expect(countOf('/sessions/session-a1')).toBe(1)
    expect(countOf('/status')).toBe(1)
    expect(countOf('/agents')).toBe(1)
    expect(screen.getByText('Resposta parcial')).toBeInTheDocument()
  })
})
