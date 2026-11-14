import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import { AppShell } from '@/components/layout/AppShell'
import { usePlaygroundStore } from '@/store'

import { BFF } from '../msw/handlers'
import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// QA P4-03: dois cliques seguidos na lista de sessões com o GET da 1ª lento.
// O último clique manda: a conversa e a URL ficam na sessão B.

vi.mock('next/navigation', () => ({ usePathname: () => '/playground' }))

const initialStoreState = usePlaygroundStore.getState()

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = () => undefined
  window.matchMedia = (query: string) =>
    ({ media: query, matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList
})

beforeEach(() => {
  window.history.replaceState(null, '', '/playground?agent=agent-1')
  usePlaygroundStore.setState(initialStoreState, true)
})
afterEach(() => window.history.replaceState(null, '', '/'))

const historyOf = (tag: string) => ({
  success: true,
  data: { chat_history: [{ role: 'assistant', content: `Resposta ${tag}`, created_at: 2 }] }
})

describe('lista de sessões: dois cliques com o GET do primeiro lento', () => {
  // BUG-P4-03-QA-2 (MINOR, preexistente em SessionItem): handleGetSession faz
  // `await getSession(A)` e só depois `setSessionId(A)`; a resposta de A, já
  // descartada, ainda empurrava a URL para A depois do clique em B (corrigido).
  it('BUG-P4-03-QA-2: o último clique (B) fica na URL e na conversa', async () => {
    server.use(
      http.get(`${BFF}/sessions`, () =>
        HttpResponse.json({
          success: true,
          data: [
            { session_id: 'session-a1', title: 'Conversa A', created_at: 1 },
            { session_id: 'session-b2', title: 'Conversa B', created_at: 2 }
          ]
        })
      ),
      http.get(`${BFF}/sessions/:id`, async ({ params }) => {
        if (params.id === 'session-a1') await delay(300)
        return HttpResponse.json(historyOf(params.id === 'session-a1' ? 'A' : 'B'))
      })
    )
    renderWithIntl(
      <NuqsAdapter>
        <AppShell>
          <PlaygroundPage />
        </AppShell>
      </NuqsAdapter>
    )
    const user = userEvent.setup()
    const [a] = await screen.findAllByRole('button', { name: /Conversa A/ })
    const [b] = await screen.findAllByRole('button', { name: /Conversa B/ })
    await user.click(a)
    await user.click(b)
    await act(() => new Promise((resolve) => setTimeout(resolve, 1200)))

    expect(screen.getByText('Resposta B')).toBeInTheDocument()
    expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('session')).toBe('session-b2')
  })
})

describe('lista de sessões: clique com o GET lento e a URL saindo da sessão', () => {
  const slowSession = () =>
    server.use(
      http.get(`${BFF}/sessions/:id`, async ({ params }) => {
        if (params.id === 'session-a1') await delay(300)
        return HttpResponse.json(historyOf(String(params.id)))
      })
    )
  const render = () =>
    renderWithIntl(
      <NuqsAdapter>
        <AppShell>
          <PlaygroundPage />
        </AppShell>
      </NuqsAdapter>
    )
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 600)))

  it('a URL perde a sessão antes da resposta: nada volta à URL nem à conversa', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=session-zz')
    slowSession()
    render()
    expect(await screen.findByText('Resposta session-zz')).toBeInTheDocument()
    const [item] = await screen.findAllByRole('button', { name: /Primeira conversa/ })
    await userEvent.setup().click(item)

    await act(async () => {
      window.history.pushState(null, '', '/playground?agent=agent-1')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await settle()

    expect(window.location.search).toBe('?agent=agent-1')
    expect(screen.queryByText('Resposta session-a1')).not.toBeInTheDocument()
  })

  it('a página desmonta antes da resposta: a URL da página nova não ganha ?session=', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    slowSession()
    const view = render()
    const [item] = await screen.findAllByRole('button', { name: /Primeira conversa/ })
    await userEvent.setup().click(item)
    view.unmount()

    window.history.pushState(null, '', '/agents/agente-x')
    await settle()

    expect(window.location.pathname + window.location.search).toBe('/agents/agente-x')
    expect(usePlaygroundStore.getState().messages).toEqual([])
  })
})
