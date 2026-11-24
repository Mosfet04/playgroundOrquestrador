import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import { AppShell } from '@/components/layout/AppShell'
import { usePlaygroundStore } from '@/store'

import { BFF } from '../msw/handlers'
import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// QA do QA1-03 (D-QA1-03-4): o histórico atrasado que chega DEPOIS do fim do
// run da própria sessão. O guard do dev cobre o run em andamento (isStreaming);
// aqui o run já acabou quando o GET responde.

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

describe('histórico que chega depois do fim do run da mesma sessão', () => {
  // QA1-03-B1: o GET foi pedido antes do envio e responde com o run já
  // terminado (isStreaming=false). O histórico (sem a rodada nova) não toma o
  // lugar da conversa de agora.
  it('QA1-03-B1: não apaga a pergunta e a resposta que acabaram de chegar', async () => {
    let releaseHistory!: () => void
    const historyGate = new Promise<void>((resolve) => (releaseHistory = resolve))
    server.use(
      http.get(`${BFF}/sessions/:id`, async () => {
        await historyGate
        return HttpResponse.json({
          success: true,
          data: {
            chat_history: [
              { role: 'user', content: 'Pergunta A', created_at: 1 },
              { role: 'assistant', content: 'Resposta A', created_at: 2 }
            ]
          }
        })
      }),
      http.post(
        `${BFF}/agents/agent-1/runs`,
        () =>
          new HttpResponse(
            [
              `event: RunStarted\ndata: ${JSON.stringify({ event: 'RunStarted', session_id: 'session-a1', created_at: 3 })}\n\n`,
              `event: RunCompleted\ndata: ${JSON.stringify({ event: 'RunCompleted', content: 'Resposta nova', created_at: 4 })}\n\n`
            ].join(''),
            { headers: { 'Content-Type': 'text/event-stream' } }
          )
      )
    )
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/playground?agent=agent-1')
    renderWithIntl(
      <NuqsAdapter>
        <AppShell>
          <PlaygroundPage />
        </AppShell>
      </NuqsAdapter>
    )
    const composer = await screen.findByRole('textbox', { name: 'Mensagem para Assistente' })
    await waitFor(() => expect(composer).toBeEnabled())

    const [item] = await screen.findAllByRole('button', { name: /Primeira conversa/ })
    await user.click(item)
    await user.type(composer, 'Pergunta nova{Enter}')
    // Setup provado antes de o GET responder: a rodada nova inteira na tela e
    // o run encerrado.
    expect(await screen.findByText('Resposta nova')).toBeInTheDocument()
    expect(screen.getByText('Pergunta nova')).toBeInTheDocument()
    expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
    await waitFor(() => expect(usePlaygroundStore.getState().isStreaming).toBe(false))

    releaseHistory()
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)))

    expect(screen.getByText('Pergunta nova')).toBeInTheDocument()
    expect(screen.getByText('Resposta nova')).toBeInTheDocument()
    expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
  })
})
