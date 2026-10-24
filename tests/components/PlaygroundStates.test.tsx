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

import { BFF, agentsFixture } from '../msw/handlers'
import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P1-05 (V-P1-05-10/12/13/14): estados da conversa e do painel de sessões,
// inclusive com o orquestrador fora (antes escondidos por `isOrchestratorActive &&`).
// P2-03: a carga vem do BFF (/api/playground), sem endpoint no painel.

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

// Orquestrador fora: o BFF responde 503 `unreachable` (P2-03).
const unreachable = () => HttpResponse.json({ success: false, error: 'unreachable' }, { status: 503 })
const offline = () => server.use(http.get(`${BFF}/agents`, unreachable))

describe('/playground: área da conversa', () => {
  it('orquestrador fora (V-P2-03-2): erro sem endereço, "offline" e "Tentar de novo"; composer desabilitado; painel com "Orquestrador desconectado"', async () => {
    offline()
    renderPlayground()

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByRole('heading', { name: 'Não foi possível conectar ao orquestrador' })
    ).toBeInTheDocument()
    expect(alert.querySelector('.font-mono.break-all')).toBeNull()
    expect(alert).not.toHaveTextContent(/localhost|7777|http/)
    expect(within(alert).getByText('offline')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()

    const composer = screen.getByPlaceholderText('Conecte o orquestrador para conversar')
    expect(composer).toBeDisabled()
    expect(screen.queryByText(/Agent UI open source/)).not.toBeInTheDocument()

    expect(screen.queryByText('Modo')).not.toBeInTheDocument()
    expect(screen.getByText('Sessões')).toBeInTheDocument()
    expect(
      screen.getByText('Orquestrador desconectado. O histórico aparece quando ele voltar.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Endpoint')).not.toBeInTheDocument()
  })

  it('BFF da lista com 502 (V-P2-03-3): chip "código 502"', async () => {
    server.use(
      http.get(`${BFF}/agents`, () =>
        HttpResponse.json({ success: false, error: 'server_error' }, { status: 502 })
      )
    )
    renderPlayground()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('código 502')).toBeInTheDocument()
    expect(within(alert).queryByText('offline')).not.toBeInTheDocument()
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
      http.get(`${BFF}/agents`, async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return unreachable()
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
      http.get(`${BFF}/agents`, async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return HttpResponse.json({ success: true, data: [] })
      })
    )
    await user.click(retry)

    expect(await screen.findByRole('button', { name: 'Tentando…' })).toBeInTheDocument()
    expect(screen.queryByText('O orquestrador ainda não tem agentes')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    release()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('conectando: "Conectando ao orquestrador…" em role="status"', async () => {
    server.use(
      http.get(`${BFF}/agents`, async () => {
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
      http.get(`${BFF}/agents`, () => HttpResponse.json({ success: true, data: [] })),
      http.get(`${BFF}/teams`, () => HttpResponse.json({ success: true, data: [] }))
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

  // V-P2-03-5: ?team= numa aba nova abre em modo Team, com o team e as sessões.
  it('?team= do zero: modo Team, cartão do team e as sessões dele', async () => {
    renderPlayground('/playground?team=team-1')

    expect(await screen.findByRole('combobox', { name: 'Team: Time de suporte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Team' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Conversa do time')).toBeInTheDocument()
    expect(screen.queryByText('Primeira conversa')).not.toBeInTheDocument()
  })

  it('?agent= e ?team= juntos: vale ?agent=', async () => {
    renderPlayground('/playground?agent=agent-1&team=team-1')

    expect(await screen.findByRole('combobox', { name: 'Agente: Assistente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agente' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('/playground: painel de sessões', () => {
  it('falha ao carregar sessões: alerta com "Tentar de novo", sem toast; tentar de novo lista', async () => {
    server.use(
      http.get(`${BFF}/sessions`, () => HttpResponse.json({}, { status: 500 }))
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
      http.get(`${BFF}/sessions`, () => HttpResponse.json({}, { status: 500 }))
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
      http.get(`${BFF}/sessions`, async () => {
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

  it('modo Team sem team: "Selecione um team…"', () => {
    usePlaygroundStore.setState({ isOrchestratorActive: true, mode: 'team' })
    blank('?agent=agent-1')

    expect(screen.getByText('Selecione um team para ver o histórico.')).toBeInTheDocument()
  })

  it('sem storage: o link "storage" abre em nova aba com rel seguro', () => {
    usePlaygroundStore.setState({ isOrchestratorActive: true, hasStorage: false, agents: agentsFixture })
    blank('?agent=agent-1')

    const link = screen.getByRole('link', { name: 'storage' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
