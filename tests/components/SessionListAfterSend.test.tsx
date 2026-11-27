import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import { AppShell } from '@/components/layout/AppShell'
import { usePlaygroundStore } from '@/store'
import type { SessionEntry } from '@/types/playground'

import { BFF, agentsFixture } from '../msw/handlers'
import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// QA1-02 (#4): depois de enviar, a lista de sessões continua com a sessão
// ativa destacada e o horário novo, sem reload. A lista é do servidor: o fim
// do run (ok ou com erro) a relê. O agno grava a sessão antes do RunError
// (agno/agent/_run.py: acleanup_and_store), então ela existe no servidor.

vi.mock('next/navigation', () => ({ usePathname: () => '/playground' }))

const initialStoreState = usePlaygroundStore.getState()
const nowSeconds = () => Math.floor(Date.now() / 1000)
const yesterday = () => nowSeconds() - 86_400

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = () => undefined
  window.matchMedia = (query: string) =>
    ({ media: query, matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

const sse = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )
const completed = (sessionId: string) => [
  { event: 'RunStarted', session_id: sessionId, created_at: nowSeconds() },
  { event: 'RunContent', content: 'Resposta nova', created_at: nowSeconds() },
  { event: 'RunCompleted', content: 'Resposta nova', created_at: nowSeconds() }
]
// 503 do provedor ("high demand"): o agno encerra o run com RunError.
const failed = (sessionId: string) => [
  { event: 'RunStarted', session_id: sessionId, created_at: nowSeconds() },
  { event: 'RunError', content: 'high demand', created_at: nowSeconds() }
]

// Lista do servidor: `before` até o run terminar, `after` depois (o agno
// grava a sessão e o updated_at no fim do run).
function serveSessions(before: SessionEntry[], after: () => SessionEntry[]) {
  const state = { runFinished: false, listReads: 0 }
  server.use(
    http.get(`${BFF}/sessions`, () => {
      state.listReads++
      return HttpResponse.json({ success: true, data: state.runFinished ? after() : before })
    }),
    http.get(`${BFF}/sessions/:id`, () =>
      HttpResponse.json({
        success: true,
        data: { chat_history: [{ role: 'user', content: 'Ola', created_at: yesterday() }] }
      })
    )
  )
  return state
}

function serveRun(events: Record<string, unknown>[], state: { runFinished: boolean }) {
  server.use(
    http.post(`${BFF}/agents/agent-1/runs`, () => {
      state.runFinished = true
      return sse(events)
    })
  )
}

const renderPlayground = () =>
  renderWithIntl(
    <NuqsAdapter>
      <AppShell>
        <PlaygroundPage />
      </AppShell>
    </NuqsAdapter>
  )

// Alguns turnos do event loop: o que estava a caminho (promessas, timers de 0 ms)
// chega antes da asserção negativa que vem depois.
const flush = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
  })

const send = async (text: string) => {
  const user = userEvent.setup()
  const box = await screen.findByRole('textbox', { name: 'Mensagem para Assistente' })
  await waitFor(() => expect(box).toBeEnabled())
  await user.type(box, `${text}{Enter}`)
  await waitFor(() => expect(usePlaygroundStore.getState().isStreaming).toBe(false))
}

// A linha é um botão com o título e o horário ("ontem" ou HH:mm).
const sessionRow = (title: string) => screen.findByRole('button', { name: new RegExp(`^${title}`) })

describe('lista de sessões depois do envio (#4)', () => {
  it.each([
    ['resposta completa', completed],
    ['erro do modelo (RunError)', failed]
  ])('sessão "Ola" aberta, %s: "Ola" segue destacada, com o horário novo', async (_, events) => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=s-ola')
    const ola = { session_id: 's-ola', title: 'Ola' }
    const state = serveSessions([{ ...ola, updated_at: yesterday() }], () => [
      { ...ola, updated_at: nowSeconds() }
    ])
    serveRun(events('s-ola'), state)
    renderPlayground()
    expect(await sessionRow('Ola')).toHaveAccessibleName(/ontem$/)

    await send('de novo')

    await waitFor(async () => expect(await sessionRow('Ola')).not.toHaveAccessibleName(/ontem$/))
    expect(await sessionRow('Ola')).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByText(/Nenhuma sessão ainda/)).not.toBeInTheDocument()
  })

  it.each([
    ['resposta completa', completed],
    ['erro do modelo (RunError)', failed]
  ])('conversa nova, %s: a sessão criada aparece destacada', async (_, events) => {
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    const state = serveSessions([], () => [
      { session_id: 's-nova', title: 'primeira pergunta', updated_at: nowSeconds() }
    ])
    serveRun(events('s-nova'), state)
    renderPlayground()
    expect(await screen.findByText(/Nenhuma sessão ainda/)).toBeInTheDocument()

    await send('primeira pergunta')

    expect(await sessionRow('primeira pergunta')).toHaveAttribute('aria-current', 'true')
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(await sessionRow('primeira pergunta')).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByText(/Nenhuma sessão ainda/)).not.toBeInTheDocument()
  })

  // A releitura do fim do run não pisca a lista (sem skeleton) e é uma só.
  it('a releitura do fim do run é uma só e não troca a lista pelo carregamento', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=s-ola')
    const ola = { session_id: 's-ola', title: 'Ola', updated_at: yesterday() }
    const state = serveSessions([ola], () => [ola])
    serveRun(completed('s-ola'), state)
    renderPlayground()
    await sessionRow('Ola')
    const readsBefore = state.listReads
    const loading: boolean[] = []
    const unsubscribe = usePlaygroundStore.subscribe((s) => loading.push(s.isSessionsLoading))

    await send('de novo')
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    unsubscribe()

    expect(state.listReads - readsBefore).toBe(1)
    expect(loading).not.toContain(true)
  })

  // Corrida: a releitura do fim do run de A chega depois da lista de B (o
  // usuário trocou de agente): a lista de B fica.
  it('resposta atrasada da lista de A depois da troca para B: fica a lista de B', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=s-ola')
    let slowA = false
    // Sinal de que a resposta atrasada de A saiu do servidor: a asserção só
    // vale depois dela, sem depender de tempo fixo.
    let aResponded = false
    server.use(
      // agent-2 com storage, para ter lista própria.
      http.get(`${BFF}/agents`, () =>
        HttpResponse.json({
          success: true,
          data: agentsFixture.map((agent) => ({ ...agent, storage: true }))
        })
      ),
      http.get(`${BFF}/sessions`, async ({ request }) => {
        const componentId = new URL(request.url).searchParams.get('component_id')
        if (componentId === 'agent-1') {
          if (slowA) {
            await delay(300)
            aResponded = true
          }
          return HttpResponse.json({
            success: true,
            data: [{ session_id: 's-ola', title: 'Ola', updated_at: yesterday() }]
          })
        }
        return HttpResponse.json({
          success: true,
          data: [{ session_id: 's-b', title: 'Conversa B', updated_at: yesterday() }]
        })
      }),
      http.get(`${BFF}/sessions/:id`, () =>
        HttpResponse.json({ success: true, data: { chat_history: [] } })
      ),
      http.post(`${BFF}/agents/agent-1/runs`, () => {
        slowA = true
        return sse(completed('s-ola'))
      })
    )
    renderPlayground()
    await sessionRow('Ola')

    await send('de novo')
    await act(async () => {
      window.history.pushState(null, '', '/playground?agent=agent-2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await waitFor(() => expect(aResponded).toBe(true))
    await flush()

    expect(usePlaygroundStore.getState().sessionsData).toEqual([
      { session_id: 's-b', title: 'Conversa B', updated_at: expect.any(Number) }
    ])
  })

  // Corrida (QA1-02, lacuna): a lista da carga ainda está em curso (orquestrador
  // lento) quando o run termina e a releitura do fim toma a vez. A da carga é
  // descartada como velha; o carregamento tem de acabar mesmo assim, não deixar
  // o skeleton para sempre.
  it('lista da carga lenta + releitura do fim do run: o carregamento termina e a lista aparece', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    let reads = 0
    let slowResponded = false
    server.use(
      http.get(`${BFF}/sessions`, async () => {
        reads++
        if (reads === 1) {
          await delay(1_500)
          slowResponded = true
          return HttpResponse.json({ success: true, data: [] })
        }
        return HttpResponse.json({
          success: true,
          data: [{ session_id: 's-nova', title: 'primeira pergunta', updated_at: nowSeconds() }]
        })
      })
    )
    serveRun(completed('s-nova'), { runFinished: false })
    renderPlayground()
    await waitFor(() => expect(usePlaygroundStore.getState().isSessionsLoading).toBe(true))

    await send('primeira pergunta')
    await waitFor(() => expect(reads).toBe(2))
    // A lista lenta da carga responde (e é descartada) antes da asserção.
    await waitFor(() => expect(slowResponded).toBe(true), { timeout: 4_000 })
    await flush()

    expect(usePlaygroundStore.getState().isSessionsLoading).toBe(false)
    expect(await sessionRow('primeira pergunta')).toBeInTheDocument()
  })

  // A releitura do fim do run que falha não derruba a lista que está na tela.
  it('releitura do fim do run com erro 500: a lista segue e não aparece a caixa de erro', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=s-ola')
    const ola = { session_id: 's-ola', title: 'Ola', updated_at: yesterday() }
    const state = { runFinished: false }
    let served502 = false
    server.use(
      http.get(`${BFF}/sessions`, () => {
        if (!state.runFinished) return HttpResponse.json({ success: true, data: [ola] })
        served502 = true
        return HttpResponse.json({ success: false, error: 'unreachable' }, { status: 502 })
      }),
      http.get(`${BFF}/sessions/:id`, () =>
        HttpResponse.json({ success: true, data: { chat_history: [] } })
      )
    )
    serveRun(completed('s-ola'), state)
    renderPlayground()
    await sessionRow('Ola')

    await send('de novo')
    await waitFor(() => expect(served502).toBe(true))
    await flush()

    expect(await sessionRow('Ola')).toHaveAttribute('aria-current', 'true')
    expect(usePlaygroundStore.getState().sessionsError).toBe(false)
  })

  // Corrida: trocar para Team no meio do stream aborta o run; o run abortado
  // não relê a lista do agente por cima da do team.
  it('troca de aba no meio do run: nenhuma releitura da lista do agente; fica a do team', async () => {
    window.history.replaceState(null, '', '/playground?agent=agent-1&session=s-ola')
    const agentListReads = { value: 0 }
    const aborted = { value: false }
    server.use(
      http.get(`${BFF}/sessions`, ({ request }) => {
        const params = new URL(request.url).searchParams
        if (params.get('type') === 'agent') agentListReads.value++
        return HttpResponse.json({
          success: true,
          data:
            params.get('type') === 'team'
              ? [{ session_id: 's-t', title: 'Conversa do time', updated_at: yesterday() }]
              : [{ session_id: 's-ola', title: 'Ola', updated_at: yesterday() }]
        })
      }),
      http.get(`${BFF}/sessions/:id`, () =>
        HttpResponse.json({ success: true, data: { chat_history: [] } })
      ),
      http.post(`${BFF}/agents/agent-1/runs`, ({ request }) => {
        const started = `event: RunStarted\ndata: ${JSON.stringify({ event: 'RunStarted', session_id: 's-ola', created_at: 1 })}\n\n`
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(started))
            request.signal.addEventListener('abort', () => {
              aborted.value = true
              controller.error(request.signal.reason)
            })
          }
        })
        return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } })
      })
    )
    renderPlayground()
    await sessionRow('Ola')
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: 'Mensagem para Assistente' }), 'oi{Enter}')
    await waitFor(() => expect(usePlaygroundStore.getState().isStreaming).toBe(true))
    const readsBeforeSwitch = agentListReads.value

    await user.click(screen.getByRole('button', { name: 'Team' }))
    await waitFor(() => expect(aborted.value).toBe(true))
    // A lista do team (leitura posterior ao abort) é o sinal de que a troca
    // assentou; só depois se confere que o run abortado não releu a do agente.
    expect(await sessionRow('Conversa do time')).toBeInTheDocument()
    await flush()

    expect(agentListReads.value).toBe(readsBeforeSwitch)
    expect(new URLSearchParams(window.location.search).get('team')).toBe('team-1')
    expect(screen.queryByRole('button', { name: /^Ola/ })).not.toBeInTheDocument()
  })

  // Corrida (gate do QA1-02): a releitura do fim do run chega com o diálogo de
  // excluir aberto e a lista em outra ordem que a otimista (a nova sessão no
  // topo). A linha não remonta: o diálogo segue aberto e a exclusão vale.
  describe('releitura do fim do run com o diálogo de excluir aberto', () => {
    const old = { session_id: 's-velha', title: 'Conversa velha', updated_at: yesterday() }
    const created = { session_id: 's-nova', title: 'nova pergunta', updated_at: nowSeconds() }
    const setup = () => {
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      const state = { runFinished: false, deleted: false }
      server.use(
        http.get(`${BFF}/sessions`, async () => {
          if (!state.runFinished) return HttpResponse.json({ success: true, data: [old] })
          // Lida antes do DELETE, respondida depois de liberada; o servidor
          // ordena diferente da lista otimista.
          const data = state.deleted ? [old] : [old, created]
          await held
          return HttpResponse.json({ success: true, data })
        }),
        http.delete(`${BFF}/sessions/:id`, () => {
          state.deleted = true
          return new HttpResponse(null, { status: 204 })
        })
      )
      serveRun(completed('s-nova'), state)
      return { release }
    }
    const deleteButton = () =>
      screen.getByRole('button', { name: 'Excluir sessão "nova pergunta"' })
    const dialog = () => screen.queryByRole('dialog', { name: 'Excluir sessão' })

    it('a lista reordenada chega: o diálogo continua aberto', async () => {
      window.history.replaceState(null, '', '/playground?agent=agent-1')
      const { release } = setup()
      renderPlayground()
      await sessionRow('Conversa velha')
      await send('nova pergunta')
      await sessionRow('nova pergunta')

      await userEvent.setup().click(deleteButton())
      expect(dialog()).toBeInTheDocument()
      await act(async () => release())
      // A lista do servidor (ordem nova) foi aplicada; só então vale o diálogo.
      await waitFor(() =>
        expect(usePlaygroundStore.getState().sessionsData?.map((session) => session.session_id)).toEqual([
          old.session_id,
          created.session_id
        ])
      )
      await flush()

      expect(dialog()).toBeInTheDocument()
    })

    it('excluir com a releitura a caminho: a sessão excluída não volta', async () => {
      window.history.replaceState(null, '', '/playground?agent=agent-1')
      const { release } = setup()
      renderPlayground()
      await sessionRow('Conversa velha')
      await send('nova pergunta')
      await sessionRow('nova pergunta')

      const user = userEvent.setup()
      await user.click(deleteButton())
      await user.click(screen.getByRole('button', { name: 'Excluir' }))
      await waitFor(() => expect(dialog()).not.toBeInTheDocument())
      await act(async () => release())
      await flush()

      expect(screen.queryByRole('button', { name: /^nova pergunta/ })).not.toBeInTheDocument()
      expect(await sessionRow('Conversa velha')).toBeInTheDocument()
    })
  })
})
