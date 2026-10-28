import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '@/components/management/dashboard/Dashboard'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P1-05 (V-P1-05-8/9): carregando, erro do stats (sem skeleton infinito) e o
// dashboard sem dados. P2-05: o período vai em ?period= e vale para a página.

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
  peakDailyUsers: 0,
  totalSessions: 0,
  totalAgentSessions: 0,
  totalTeamSessions: 0,
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

describe('Dashboard: estados', () => {
  it('carregando: skeleton com aria-busy e "Carregando dashboard…" em role="status"', async () => {
    server.use(
      http.get('*/api/dashboard/stats', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      })
    )
    renderWithIntl(<Dashboard />)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Carregando dashboard…')
    expect(status.closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('stats com falha: bloco de erro com "Tentar de novo", não o skeleton', async () => {
    server.use(http.get('*/api/dashboard/stats', () => HttpResponse.error()))
    renderWithIntl(<Dashboard />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar o dashboard')
    expect(within(alert).getByText('offline')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('stats com success: false (500): bloco de erro com "código 500"; tentar de novo carrega', async () => {
    server.use(stats(500))
    const user = userEvent.setup()
    renderWithIntl(<Dashboard />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('código 500')).toBeInTheDocument()

    server.use(stats())
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Agentes ativos')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // Carga inicial rápida; depois 30d (lento) e, antes de ele responder, 7d
  // (rápido): a resposta lenta chega por último e não pode sobrescrever a nova.
  describe('troca de período: só a requisição mais recente escreve', () => {
    const slow = (slowResponse: () => Response) => {
      const asked: (string | null)[] = []
      server.use(
        http.get('*/api/dashboard/stats', async ({ request }) => {
          const period = new URL(request.url).searchParams.get('period')
          asked.push(period)
          if (period === '7d')
            return HttpResponse.json({ success: true, data: { ...emptyStats, totalTokens: 777 } })
          if (period === '30d') {
            await delay(400)
            return slowResponse()
          }
          return HttpResponse.json({ success: true, data: emptyStats })
        })
      )
      return asked
    }

    const pick = async (user: ReturnType<typeof userEvent.setup>, option: string) => {
      await user.click(screen.getByRole('combobox'))
      await user.click(await screen.findByRole('option', { name: option }))
    }

    beforeEach(() => {
      Element.prototype.hasPointerCapture = () => false
      Element.prototype.scrollIntoView = () => undefined
    })

    it('resposta lenta do período anterior não sobrescreve a nova', async () => {
      const asked = slow(() =>
        HttpResponse.json({ success: true, data: { ...emptyStats, totalTokens: 111 } })
      )
      const user = userEvent.setup()
      renderWithIntl(<Dashboard />)

      await screen.findByText('Agentes ativos')
      await pick(user, 'Últimos 30 dias')
      await pick(user, 'Últimos 7 dias')

      expect(await screen.findByText('777')).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(screen.getByText('777')).toBeInTheDocument()
      expect(screen.queryByText('111')).not.toBeInTheDocument()
      expect(asked).toEqual(['today', '30d', '7d'])
    })

    it('falha lenta do período anterior não derruba o novo (nenhum alert)', async () => {
      slow(() => HttpResponse.json({ success: false, error: 'server_error' }, { status: 502 }))
      const user = userEvent.setup()
      renderWithIntl(<Dashboard />)

      await screen.findByText('Agentes ativos')
      await pick(user, 'Últimos 30 dias')
      await pick(user, 'Últimos 7 dias')

      expect(await screen.findByText('777')).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(screen.getByText('777')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('período: sem "Última hora" e a área dos cards fica aria-busy enquanto o pedido está em curso', async () => {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.scrollIntoView = () => undefined
    server.use(
      http.get('*/api/dashboard/stats', async ({ request }) => {
        if (new URL(request.url).searchParams.get('period') === '90d') await delay(400)
        return HttpResponse.json({ success: true, data: emptyStats })
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<Dashboard />)

    await user.click(await screen.findByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Hoje' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Última hora' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Últimos 90 dias' }))

    const area = screen.getByText('Agentes ativos').closest('[aria-busy]')
    expect(area).toHaveAttribute('aria-busy', 'true')
    await waitFor(() => expect(area).toHaveAttribute('aria-busy', 'false'))
  })

  it('troca de período com falha: o erro entra no lugar dos cards, o seletor fica e "Tentar de novo" pede o período escolhido', async () => {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.scrollIntoView = () => undefined
    const asked: (string | null)[] = []
    server.use(
      http.get('*/api/dashboard/stats', ({ request }) => {
        const period = new URL(request.url).searchParams.get('period')
        asked.push(period)
        return period === '30d'
          ? HttpResponse.json({ success: false, error: 'server_error' }, { status: 502 })
          : HttpResponse.json({ success: true, data: emptyStats })
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<Dashboard />)

    await user.click(await screen.findByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Últimos 30 dias' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('código 502')).toBeInTheDocument()
    expect(screen.queryByText('Agentes ativos')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('Últimos 30 dias')

    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(asked).toEqual(['today', '30d', '30d']))
  })

  it('sem dados: KPIs em 0, "Sem dados no período" nos gráficos e as linhas de modelos', async () => {
    server.use(stats())
    renderWithIntl(<Dashboard />)

    expect(await screen.findByText('Nenhum modelo usado no período.')).toBeInTheDocument()
    expect(screen.getByText('Nenhum agente usa RAG.')).toBeInTheDocument()
    expect(screen.getAllByText('Sem dados no período')).toHaveLength(2)
    expect(
      screen.getAllByText('Converse com um agente no playground para gerar métricas.')
    ).toHaveLength(2)
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(4)
    expect(document.querySelector('.recharts-cartesian-axis')).toBeNull()
  })
})
