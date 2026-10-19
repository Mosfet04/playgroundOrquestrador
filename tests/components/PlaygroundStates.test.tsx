import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { Toaster } from 'sonner'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import PlaygroundPage from '@/app/(app)/playground/page'
import SessionBlankState from '@/components/playground/Sidebar/Sessions/SessionBlankState'
import { usePlaygroundStore } from '@/store'

import { AGENTOS_URL } from '../msw/handlers'
import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P1-05 (V-P1-05-10/12/13/14): estados da conversa e do painel de sessões,
// inclusive com o orquestrador fora (antes escondidos por `isEndpointActive &&`).

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
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
  usePlaygroundStore.setState({ selectedEndpoint: AGENTOS_URL, hydrated: true })
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const renderPlayground = (url = '/playground') => {
  window.history.replaceState(null, '', url)
  return renderWithIntl(
    <NuqsAdapter>
      <PlaygroundPage />
      <Toaster />
    </NuqsAdapter>
  )
}

const offline = () =>
  server.use(
    http.get(`${AGENTOS_URL}/status`, () => HttpResponse.error()),
    http.get(`${AGENTOS_URL}/health`, () => HttpResponse.error())
  )

describe('/playground: área da conversa', () => {
  it('orquestrador fora: erro com o endpoint, "offline" e "Tentar de novo"; composer desabilitado; painel com "Endpoint desconectado"', async () => {
    offline()
    renderPlayground()

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByRole('heading', { name: 'Não foi possível conectar ao orquestrador' })
    ).toBeInTheDocument()
    expect(within(alert).getByText(AGENTOS_URL)).toHaveClass('font-mono')
    expect(within(alert).getByText('offline')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()

    const composer = screen.getByPlaceholderText('Conecte o orquestrador para conversar')
    expect(composer).toBeDisabled()
    expect(screen.queryByText(/Agent UI open source/)).not.toBeInTheDocument()

    expect(screen.queryByText('Modo')).not.toBeInTheDocument()
    expect(screen.getByText('Sessões')).toBeInTheDocument()
    expect(
      screen.getByText('Endpoint desconectado. Conecte o endpoint para ver o histórico.')
    ).toBeInTheDocument()
  })

  it('"Tentar de novo" com o orquestrador de volta: o erro sai e o agente é selecionado', async () => {
    offline()
    const user = userEvent.setup()
    renderPlayground()

    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    server.resetHandlers()
    await user.click(retry)

    expect(await screen.findByRole('heading', { name: 'Converse com Assistente' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('"Tentar de novo" falhando de novo (R1): "Tentando…" com o bloco no lugar e o foco fica no botão', async () => {
    offline()
    const user = userEvent.setup()
    renderPlayground()

    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    let release: () => void = () => undefined
    server.use(
      http.get(`${AGENTOS_URL}/status`, async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return HttpResponse.error()
      })
    )
    await user.click(retry)

    expect(await screen.findByRole('button', { name: 'Tentando…' })).toHaveFocus()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Conectando ao orquestrador…')).not.toBeInTheDocument()

    release()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveFocus()
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('"Tentar de novo" com /agents pendente (R9): o bloco fica, sem o falso "ainda não tem agentes"', async () => {
    offline()
    const user = userEvent.setup()
    renderPlayground()

    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    server.resetHandlers()
    let release: () => void = () => undefined
    server.use(
      http.get(`${AGENTOS_URL}/agents`, async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return HttpResponse.json([])
      })
    )
    await user.click(retry)

    expect(await screen.findByRole('button', { name: 'Tentando…' })).toBeInTheDocument()
    await waitFor(() => expect(usePlaygroundStore.getState().isEndpointActive).toBe(true))
    expect(screen.queryByText('O orquestrador ainda não tem agentes')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    release()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('conectando: "Conectando ao orquestrador…" em role="status"', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/status`, async () => {
        await delay('infinite')
        return HttpResponse.json({})
      })
    )
    renderPlayground()

    // Há outro role="status" na página: o anúncio do stream, vazio (P1-06).
    expect(await screen.findByText('Conectando ao orquestrador…')).toHaveAttribute(
      'role',
      'status'
    )
  })

  it('online sem agentes nem teams: vazio com "Criar primeiro agente"', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/agents`, () => HttpResponse.json([])),
      http.get(`${AGENTOS_URL}/teams`, () => HttpResponse.json([]))
    )
    renderPlayground()

    expect(
      await screen.findByRole('heading', { name: 'O orquestrador ainda não tem agentes' })
    ).toBeInTheDocument()
    expect(screen.getByText('Crie um agente e volte aqui para conversar com ele.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar primeiro agente' })).toHaveAttribute(
      'href',
      '/agents/new'
    )
    expect(
      screen.getByPlaceholderText('Selecione um agente ou team para conversar')
    ).toBeDisabled()
  })

  it('agente selecionado sem mensagens: "Converse com {nome}" e composer habilitado', async () => {
    renderPlayground('/playground?agent=agent-1')

    expect(await screen.findByRole('heading', { name: 'Converse com Assistente' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Envie uma mensagem para testar. Respostas, tool calls e métricas aparecem aqui.'
      )
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Escreva uma mensagem para Assistente')).toBeEnabled()
    )
  })
})

describe('/playground: painel de sessões', () => {
  it('falha ao carregar sessões: alerta com "Tentar de novo", sem toast; tentar de novo lista', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/sessions`, () => HttpResponse.json({}, { status: 500 }))
    )
    const user = userEvent.setup()
    renderPlayground('/playground?agent=agent-1')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar as sessões')
    expect(screen.getAllByText('Não foi possível carregar as sessões')).toHaveLength(1)

    server.resetHandlers()
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Primeira conversa')).toBeInTheDocument()
  })

  it('"Tentar de novo" das sessões falhando de novo (R1): a caixa fica com "Tentando…" e o foco no botão', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/sessions`, () => HttpResponse.json({}, { status: 500 }))
    )
    const user = userEvent.setup()
    renderPlayground('/playground?agent=agent-1')

    const alert = await screen.findByRole('alert')
    // O EntitySelector foca o composer (setTimeout + rAF): espera esse foco
    // chegar antes do clique, senão ele rouba o foco do botão sob carga (R8).
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Escreva uma mensagem para Assistente')).toHaveFocus()
    )
    let release: () => void = () => undefined
    server.use(
      http.get(`${AGENTOS_URL}/sessions`, async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return HttpResponse.json({}, { status: 500 })
      })
    )
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))

    const busy = await within(alert).findByRole('button', { name: 'Tentando…' })
    expect(busy).toHaveFocus()
    expect(busy).toHaveAttribute('aria-disabled', 'true')

    release()
    await waitFor(() =>
      expect(within(alert).getByRole('button', { name: 'Tentar de novo' })).toHaveFocus()
    )
    expect(alert).toBeInTheDocument()
  })

  const blank = (searchParams = '') =>
    renderWithIntl(
      <NuqsTestingAdapter searchParams={searchParams}>
        <SessionBlankState />
      </NuqsTestingAdapter>
    )

  it('sem endpoint vem antes de offline: "Selecione um endpoint…"', () => {
    usePlaygroundStore.setState({ selectedEndpoint: '', isEndpointActive: false })
    blank('?agent=agent-1')

    expect(screen.getByText('Selecione um endpoint para ver o histórico.')).toBeInTheDocument()
  })

  it('modo Team sem team: "Selecione um team…"', () => {
    usePlaygroundStore.setState({ isEndpointActive: true, mode: 'team' })
    blank('?agent=agent-1')

    expect(screen.getByText('Selecione um team para ver o histórico.')).toBeInTheDocument()
  })

  it('sem storage: o link "storage" abre em nova aba com rel seguro', () => {
    usePlaygroundStore.setState({ isEndpointActive: true, hasStorage: false })
    blank('?agent=agent-1')

    const link = screen.getByRole('link', { name: 'storage' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
