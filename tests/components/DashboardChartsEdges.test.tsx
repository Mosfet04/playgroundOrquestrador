import { act, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '@/components/management/dashboard/Dashboard'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// QA1-08 (QA): lacunas além de tests/components/DashboardCharts.test.tsx. EN do
// donut sem "team" com team = 0 (D-QA1-08-4) e série única de team (a cor segue
// a série, não a posição).

beforeEach(() => {
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
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => vi.useRealTimers())

function serve(agent: number, team: number) {
  server.use(
    http.get('*/api/dashboard/stats', () =>
      HttpResponse.json({
        success: true,
        data: {
          activeAgents: 1,
          totalAgents: 1,
          peakDailyUsers: 1,
          totalSessions: agent + team,
          totalAgentSessions: agent,
          totalTeamSessions: team,
          totalTokens: 10,
          models: [],
          embeddingModels: [],
          activityOverTime: [{ time: '2026-10-01', sessions: agent + team, agentSessions: agent, teamSessions: team }]
        }
      })
    )
  )
}

const card = async (title: string) =>
  (await screen.findByRole('heading', { name: title })).closest('.rounded-lg') as HTMLElement

describe('Dashboard (QA1-08, lacunas)', () => {
  it('EN com team = 0: o card do donut não menciona "team" em lugar nenhum; com team, a legenda traz os dois', async () => {
    serve(12, 0)
    const first = renderWithIntl(<Dashboard />, { locale: 'en' })
    const donut = await card('Sessions by type')
    expect(within(donut).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Agent sessions: 12'])
    expect(donut).not.toHaveTextContent(/team/i)
    first.unmount()

    serve(12, 5)
    renderWithIntl(<Dashboard />, { locale: 'en' })
    const both = await card('Sessions by type')
    expect(within(both).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Agent sessions: 12',
      'Team sessions: 5'
    ])
  })

  it('1 ponto só de team (agente 0): o ponto visível é o da série team, nada da série agente', async () => {
    serve(0, 3)
    renderWithIntl(<Dashboard />)
    const activity = await card('Atividade por tempo')
    await act(() => vi.advanceTimersByTimeAsync(2000))
    const dots = activity.querySelectorAll('.recharts-area-dots circle')
    expect(dots).toHaveLength(1)
    expect(dots[0]).toHaveAttribute('fill', 'hsl(var(--muted-foreground))')
    expect(within(activity).queryByText('Sessões de agente')).not.toBeInTheDocument()
  })
})
