import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '@/components/management/dashboard/Dashboard'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// V-P1-04-7: números pelo idioma (Intl via next-intl), inclusive nos eixos Y.
// O eixo de datas (rótulo do dia) fica no E2E (e2e/i18n.spec.ts).

beforeAll(() => {
  // O jsdom não mede layout: o ResponsiveContainer do recharts recebe 800×300
  // pelo ResizeObserver, como no navegador, e desenha os eixos no SVG.
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

const stats = {
  activeAgents: 3,
  totalAgents: 1204,
  uniqueUsers: 7,
  totalSessions: 2048,
  totalAgentSessions: 1204,
  totalTeamSessions: 1,
  sessionsInPeriod: 12,
  totalTokens: 1234567,
  models: [{ name: 'llama3.2', provider: 'ollama', count: 2 }],
  embeddingModels: [{ name: 'text-embedding-3-small', provider: 'openai', count: 1 }],
  activityOverTime: [{ time: '2026-10-15', sessions: 2, agentSessions: 1, teamSessions: 1 }]
}

function serveDashboard(overrides: Partial<typeof stats> = {}) {
  server.use(
    http.get('*/api/dashboard/stats', () =>
      HttpResponse.json({ success: true, data: { ...stats, ...overrides } })
    ),
    http.get('*/api/dashboard/tokens', () =>
      HttpResponse.json({
        success: true,
        data: [
          {
            agentId: 'alfa',
            agentName: 'Alfa',
            inputTokens: 1200,
            outputTokens: 300,
            totalTokens: 1500,
            sessions: 1
          }
        ]
      })
    )
  )
}

describe('Dashboard: formatos pelo idioma', () => {
  it('pt-BR: ponto de milhar e textos do catálogo', async () => {
    serveDashboard()
    renderWithIntl(<Dashboard />)

    expect(await screen.findByText('1.234.567')).toBeInTheDocument()
    expect(screen.getByText('1.204 no total')).toBeInTheDocument()
    expect(screen.getByText('1.204 agentes · 1 team · 12 no período')).toBeInTheDocument()
    expect(screen.getByText('2 usos')).toBeInTheDocument()
    expect(screen.getByText('1 uso')).toBeInTheDocument()
  })

  it('pt-BR: zero fica no plural ("0 agentes · 0 teams"), não em "one" do CLDR', async () => {
    serveDashboard({
      totalAgentSessions: 0,
      totalTeamSessions: 0,
      models: [{ name: 'llama3.2', provider: 'ollama', count: 0 }]
    })
    renderWithIntl(<Dashboard />)

    expect(
      await screen.findByText('0 agentes · 0 teams · 12 no período')
    ).toBeInTheDocument()
    expect(screen.getByText('0 usos')).toBeInTheDocument()
  })

  it('EN: vírgula de milhar e textos em inglês', async () => {
    serveDashboard()
    renderWithIntl(<Dashboard />, { locale: 'en' })

    expect(await screen.findByText('1,234,567')).toBeInTheDocument()
    expect(screen.getByText('1,204 total')).toBeInTheDocument()
    expect(screen.getByText('Active agents')).toBeInTheDocument()
    expect(screen.getByText('2 uses')).toBeInTheDocument()
  })

  it.each([
    ['pt-BR', '1.200'],
    ['en', '1,200']
  ] as const)(
    '%s: eixos Y pelo formatador e eixo de sessões só com inteiros',
    async (locale, thousands) => {
      serveDashboard()
      const { container } = renderWithIntl(<Dashboard />, { locale })

      await screen.findByText(locale === 'en' ? 'Active agents' : 'Agentes ativos')
      const ticks = async () =>
        [...container.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')].map(
          (tick) => tick.textContent
        )
      await vi.waitFor(async () => expect(await ticks()).toContain(thousands))
      // Só inteiros com separador de milhar do idioma: nada de 0.5, 0,75 ou 1200.
      expect(
        (await ticks()).filter((tick) => !/^\d{1,3}([.,]\d{3})*$/.test(tick ?? ''))
      ).toEqual([])
    }
  )
})
