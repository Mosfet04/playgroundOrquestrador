import { act, screen, waitFor } from '@testing-library/react'
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

// QA1-03 (review R4, D-QA1-03-4): trocar de sessão (clique na lista ou
// Voltar/Avançar) esvazia a conversa antes do GET, para nada da sessão
// anterior (Reenviar, envio) ir para a nova; e o histórico que chega com um
// run em andamento não toma o lugar do stream. N5: resposta gravada sem texto
// não deixa a pergunta "sem resposta".

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

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const renderPlayground = (url: string) => {
  window.history.replaceState(null, '', url)
  return renderWithIntl(
    <NuqsAdapter>
      <AppShell>
        <PlaygroundPage />
      </AppShell>
    </NuqsAdapter>
  )
}

type Entry = { role: 'user' | 'assistant'; content: unknown; created_at: number }
const historyBody = (chat_history: Entry[]) => ({ success: true, data: { chat_history } })

// Sessão "órfã": a pergunta ficou sem resposta (Reenviar à vista). A
// session-a1 (a "Primeira conversa" da lista) responde depois de `slowMs`.
const serveHistories = (slowMs = 300) =>
  server.use(
    http.get(`${BFF}/sessions/:id`, async ({ params }) => {
      if (params.id === 'orfa')
        return HttpResponse.json(
          historyBody([{ role: 'user', content: 'Pergunta órfã', created_at: 1 }])
        )
      await delay(slowMs)
      return HttpResponse.json(
        historyBody([
          { role: 'user', content: 'Pergunta A', created_at: 1 },
          { role: 'assistant', content: 'Resposta A', created_at: 2 }
        ])
      )
    })
  )

const goTo = (url: string) =>
  act(async () => {
    window.history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

describe('troca de sessão com o GET a caminho', () => {
  it('clique na lista: a conversa anterior e o Reenviar dela somem antes da resposta', async () => {
    serveHistories()
    renderPlayground('/playground?agent=agent-1&session=orfa')
    expect(await screen.findByRole('button', { name: 'Reenviar' })).toBeInTheDocument()

    const [item] = await screen.findAllByRole('button', { name: /Primeira conversa/ })
    await userEvent.setup().click(item)

    expect(screen.queryByText('Pergunta órfã')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reenviar' })).not.toBeInTheDocument()
    expect(await screen.findByText('Resposta A')).toBeInTheDocument()
  })

  it('Voltar/Avançar: a conversa anterior some antes da resposta', async () => {
    serveHistories()
    renderPlayground('/playground?agent=agent-1&session=orfa')
    expect(await screen.findByText('Pergunta órfã')).toBeInTheDocument()

    await goTo('/playground?agent=agent-1&session=session-a1')

    expect(screen.queryByText('Pergunta órfã')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reenviar' })).not.toBeInTheDocument()
    expect(await screen.findByText('Resposta A')).toBeInTheDocument()
  })

  it('envio durante o GET: o histórico que chega com o run em andamento não toma o lugar do stream', async () => {
    // O GET da sessão e o fim do stream esperam o teste: o histórico chega
    // com o run aberto, depois do 1º delta.
    let releaseHistory!: () => void
    const historyGate = new Promise<void>((resolve) => (releaseHistory = resolve))
    let finishStream!: () => void
    const streamGate = new Promise<void>((resolve) => (finishStream = resolve))
    const bodies: unknown[] = []
    server.use(
      http.get(`${BFF}/sessions/:id`, async () => {
        await historyGate
        return HttpResponse.json(
          historyBody([
            { role: 'user', content: 'Pergunta A', created_at: 1 },
            { role: 'assistant', content: 'Resposta A', created_at: 2 }
          ])
        )
      }),
      http.post(`${BFF}/agents/agent-1/runs`, async ({ request }) => {
        bodies.push(await request.json())
        const encoder = new TextEncoder()
        const write = (event: Record<string, unknown>) =>
          encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
        return new HttpResponse(
          new ReadableStream<Uint8Array>({
            async start(controller) {
              controller.enqueue(write({ event: 'RunStarted', session_id: 'session-a1', created_at: 3 }))
              controller.enqueue(write({ event: 'RunContent', content: 'parcial ', created_at: 3 }))
              await streamGate
              controller.enqueue(write({ event: 'RunContent', content: 'nova', created_at: 3 }))
              controller.enqueue(write({ event: 'RunCompleted', content: 'parcial nova', created_at: 4 }))
              controller.close()
            }
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        )
      })
    )
    const user = userEvent.setup()
    renderPlayground('/playground?agent=agent-1')
    const composer = await screen.findByRole('textbox', { name: 'Mensagem para Assistente' })
    await waitFor(() => expect(composer).toBeEnabled())

    const [item] = await screen.findAllByRole('button', { name: /Primeira conversa/ })
    await user.click(item)
    await user.type(composer, 'Pergunta nova{Enter}')
    expect(await screen.findByText('parcial')).toBeInTheDocument()
    releaseHistory()
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))

    expect(screen.getByText('Pergunta nova')).toBeInTheDocument()
    expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
    finishStream()
    expect(await screen.findByText('parcial nova')).toBeInTheDocument()
    expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
    expect(bodies).toEqual([{ message: 'Pergunta nova', session_id: 'session-a1' }])
  })
})

describe('resposta gravada sem texto (N5)', () => {
  it.each([
    ['vazia', ''],
    ['nula (só tool call ou mídia)', null]
  ])('resposta %s conta como resposta: a pergunta não fica "sem resposta"', async (_, content) => {
    server.use(
      http.get(`${BFF}/sessions/:id`, () =>
        HttpResponse.json(
          historyBody([
            { role: 'user', content: 'Gere a imagem', created_at: 1 },
            { role: 'assistant', content, created_at: 2 },
            { role: 'user', content: 'E agora?', created_at: 3 },
            { role: 'assistant', content: 'Pronto.', created_at: 4 }
          ])
        )
      )
    )
    renderPlayground('/playground?agent=agent-1&session=session-a1')

    expect(await screen.findByText('Pronto.')).toBeInTheDocument()
    expect(screen.getByText('Gere a imagem')).toBeInTheDocument()
    expect(screen.queryByText('sem resposta')).not.toBeInTheDocument()
    // A resposta sem nada para mostrar não vira bolha vazia.
    expect(screen.getAllByText('Assistente', { selector: '[role="log"] span' })).toHaveLength(1)
  })
})
