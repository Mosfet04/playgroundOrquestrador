import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '@/components/management/dashboard/Dashboard'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P1-05 (V-P1-05-8/9): carregando, erro do stats (sem skeleton infinito), erro
// só dos tokens dentro do card e o dashboard sem dados.

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        this.callback(
          [{ contentRect: { width: 800, height: 300 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        )
      }
      unobserve() {}
      disconnect() {}
    }
  )
})

const emptyStats = {
  activeAgents: 0,
  totalAgents: 0,
  uniqueUsers: 0,
  totalSessions: 0,
  totalAgentSessions: 0,
  totalTeamSessions: 0,
  sessionsInPeriod: 0,
  totalTokens: 0,
  models: [],
  embeddingModels: [],
  activityOverTime: []
}

const stats = (status = 200) =>
  http.get('*/api/dashboard/stats', () =>
    status === 200
      ? HttpResponse.json({ success: true, data: emptyStats })
      : HttpResponse.json({ success: false, error: 'x' }, { status })
  )
const tokens = (ok = true) =>
  http.get('*/api/dashboard/tokens', () =>
    ok ? HttpResponse.json({ success: true, data: [] }) : HttpResponse.error()
  )

describe('Dashboard: estados', () => {
  it('carregando: skeleton com aria-busy e "Carregando dashboard…" em role="status"', async () => {
    server.use(
      http.get('*/api/dashboard/stats', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
      tokens()
    )
    renderWithIntl(<Dashboard />)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Carregando dashboard…')
    expect(status.closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('stats com falha: bloco de erro com "Tentar de novo", não o skeleton', async () => {
    server.use(http.get('*/api/dashboard/stats', () => HttpResponse.error()), tokens())
    renderWithIntl(<Dashboard />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar o dashboard')
    expect(within(alert).getByText('offline')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('stats com success: false (500): bloco de erro com "código 500"; tentar de novo carrega', async () => {
    server.use(stats(500), tokens())
    const user = userEvent.setup()
    renderWithIntl(<Dashboard />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('código 500')).toBeInTheDocument()

    server.use(stats())
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Agentes ativos')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('só os tokens com falha: o erro fica no card de tokens e os KPIs aparecem', async () => {
    server.use(stats(), tokens(false))
    renderWithIntl(<Dashboard />)

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByRole('heading', { name: 'Não foi possível carregar o consumo de tokens' })
    ).toBeInTheDocument()
    expect(screen.getByText('Agentes ativos')).toBeInTheDocument()
    expect(screen.getByText('Consumo de tokens por entidade')).toBeInTheDocument()
  })

  it('tokens ainda carregando (R3): sem o falso "Sem dados no período" no card de tokens', async () => {
    server.use(
      stats(),
      http.get('*/api/dashboard/tokens', async () => {
        await delay('infinite')
        return HttpResponse.json({ success: true, data: [] })
      })
    )
    renderWithIntl(<Dashboard />)

    await screen.findByText('Nenhum agente usa RAG.')
    expect(screen.getAllByText('Sem dados no período')).toHaveLength(2)
  })

  it('troca de período (N3): a falha lenta do período anterior não apaga o novo', async () => {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.scrollIntoView = () => undefined
    server.use(
      stats(),
      http.get('*/api/dashboard/tokens', async ({ request }) => {
        if (new URL(request.url).searchParams.get('timeFilter') === '7d')
          return HttpResponse.json({ success: true, data: [] })
        await delay(600)
        return HttpResponse.error()
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<Dashboard />)

    await user.click(await screen.findByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Últimos 7 dias' }))

    await waitFor(() => expect(screen.getAllByText('Sem dados no período')).toHaveLength(3))
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sem dados: KPIs em 0, "Sem dados no período" nos gráficos e as linhas de modelos', async () => {
    server.use(stats(), tokens())
    renderWithIntl(<Dashboard />)

    expect(await screen.findByText('Nenhum modelo em uso pelos agentes ativos.')).toBeInTheDocument()
    expect(screen.getByText('Nenhum agente usa RAG.')).toBeInTheDocument()
    expect(screen.getAllByText('Sem dados no período')).toHaveLength(3)
    expect(
      screen.getAllByText('Converse com um agente no playground para gerar métricas.')
    ).toHaveLength(3)
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(4)
    expect(document.querySelector('.recharts-cartesian-axis')).toBeNull()
  })
})
