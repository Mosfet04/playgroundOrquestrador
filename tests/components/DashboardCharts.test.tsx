import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '@/components/management/dashboard/Dashboard'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// QA1-08 (#11): gráficos sem série fantasma. Série sem valor no período não é
// desenhada nem entra na legenda (D-QA1-08-1/2 = A); cores só por token (0009).

// O jsdom não mede layout: o ResizeObserver devolve a largura dada ao
// ResponsiveContainer do recharts (0 = ainda sem medida, o 1º frame no navegador).
function stubWidth(width: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        this.callback(
          [{ contentRect: { width, height: 300 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        )
      }
      unobserve() {}
      disconnect() {}
    }
  )
}

beforeEach(() => {
  stubWidth(800)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => vi.useRealTimers())

const AGENT_COLOR = 'hsl(var(--primary))'
const TEAM_COLOR = 'hsl(var(--muted-foreground))'

type Point = { time: string; sessions: number; agentSessions: number; teamSessions: number }

const point = (day: number, agentSessions: number, teamSessions: number): Point => ({
  time: `2026-10-${String(day).padStart(2, '0')}`,
  sessions: agentSessions + teamSessions,
  agentSessions,
  teamSessions
})

function serve(agent: number, team: number, activityOverTime: Point[]) {
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
          activityOverTime
        }
      })
    )
  )
}

const card = async (title: string) => {
  const heading = await screen.findByRole('heading', { name: title })
  return heading.closest('.rounded-lg') as HTMLElement
}

// As fatias só entram no SVG depois da animação inicial do recharts (1,5 s): o
// relógio falso a conclui sem esperar.
const finishAnimation = () => act(() => vi.advanceTimersByTimeAsync(2000))
const sectorFills = (donut: HTMLElement) =>
  [...donut.querySelectorAll('.recharts-pie-sector path')].map((sector) => sector.getAttribute('fill'))

describe('Dashboard: donut "Sessões por tipo"', () => {
  it('agente e team: 2 fatias, legenda HTML abaixo com os valores e nenhum rótulo no SVG', async () => {
    serve(12, 5, [point(1, 12, 5)])
    renderWithIntl(<Dashboard />)

    const donut = await card('Sessões por tipo')
    const legend = within(donut).getByRole('list', { name: 'Sessões por tipo' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Sessões de agente: 12',
      'Sessões de team: 5'
    ])
    await finishAnimation()
    expect(sectorFills(donut)).toEqual([AGENT_COLOR, TEAM_COLOR])
    expect(donut.querySelector('.recharts-surface')?.textContent).toBe('')
    // O marcador de cada item tem a cor exata da fatia.
    const markers = [...legend.querySelectorAll('li > span[aria-hidden]')] as HTMLElement[]
    expect(markers.map((marker) => marker.style.background)).toEqual([AGENT_COLOR, TEAM_COLOR])
  })

  it('0 sessões de team: 1 fatia na cor do agente, sem item nem texto de team no card', async () => {
    serve(12, 0, [point(1, 12, 0)])
    renderWithIntl(<Dashboard />)

    const donut = await card('Sessões por tipo')
    expect(within(donut).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Sessões de agente: 12'
    ])
    await finishAnimation()
    expect(sectorFills(donut)).toEqual([AGENT_COLOR])
    expect(donut).not.toHaveTextContent(/team/i)
  })

  it('só team: 1 fatia na cor do team (a cor segue a entrada, não o índice)', async () => {
    serve(0, 4, [point(1, 0, 4)])
    renderWithIntl(<Dashboard />)

    const donut = await card('Sessões por tipo')
    await finishAnimation()
    expect(sectorFills(donut)).toEqual([TEAM_COLOR])
    expect(within(donut).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Sessões de team: 4'
    ])
  })
})

describe('Dashboard: linha "Atividade por tempo"', () => {
  it('1 ponto de agente e 0 de team: o ponto visível tem a cor da série agente e nada de team', async () => {
    serve(1, 0, [point(1, 1, 0)])
    renderWithIntl(<Dashboard />)

    const activity = await card('Atividade por tempo')
    await finishAnimation()
    const dots = activity.querySelectorAll('.recharts-area-dots circle')
    expect(dots).toHaveLength(1)
    expect(dots[0]).toHaveAttribute('fill', AGENT_COLOR)
    expect(dots[0]).toHaveAttribute('r', '4')
    // O dot não herda o fillOpacity 0,6 da área: o ponto fica na cor cheia da série.
    expect(dots[0]).toHaveAttribute('fill-opacity', '1')
    expect(activity.querySelectorAll('.recharts-area')).toHaveLength(1)
    expect(within(activity).getByText('Sessões de agente')).toBeInTheDocument()
    expect(within(activity).queryByText('Sessões de team')).not.toBeInTheDocument()
  })

  it('vários pontos e team zerado: só a área do agente, sem traço de team, legenda só do agente', async () => {
    serve(3, 0, [point(1, 1, 0), point(2, 2, 0)])
    renderWithIntl(<Dashboard />)

    const activity = await card('Atividade por tempo')
    await finishAnimation()
    const strokes = [...activity.querySelectorAll('.recharts-area-curve')].map((path) =>
      path.getAttribute('stroke')
    )
    expect(strokes).toEqual([AGENT_COLOR])
    expect(activity.querySelectorAll('.recharts-area-dots circle')).toHaveLength(0)
    expect(within(activity).queryByText('Sessões de team')).not.toBeInTheDocument()
  })

  it('agente e team com valor: as duas séries, agente embaixo e team empilhado em cima', async () => {
    serve(3, 2, [point(1, 1, 1), point(2, 2, 1)])
    renderWithIntl(<Dashboard />)

    const activity = await card('Atividade por tempo')
    await finishAnimation()
    const strokes = [...activity.querySelectorAll('.recharts-area-curve')].map((path) =>
      path.getAttribute('stroke')
    )
    expect(strokes).toEqual([AGENT_COLOR, TEAM_COLOR])
    expect(within(activity).getByText('Sessões de team')).toBeInTheDocument()
  })

  it('pontos só com zero: estado vazio, sem eixos', async () => {
    serve(0, 0, [point(1, 0, 0), point(2, 0, 0)])
    renderWithIntl(<Dashboard />)

    const activity = await card('Atividade por tempo')
    expect(within(activity).getByText('Sem dados no período')).toBeInTheDocument()
    expect(activity.querySelector('.recharts-cartesian-axis')).toBeNull()
  })
})

describe('Dashboard: 1ª pintura dos gráficos', () => {
  it('sem largura medida o corpo do card é um esqueleto da altura final', async () => {
    stubWidth(0)
    serve(12, 5, [point(1, 12, 5)])
    renderWithIntl(<Dashboard />)

    const donut = await card('Sessões por tipo')
    const frame = donut.querySelector('.relative') as HTMLElement
    expect(frame).toHaveStyle({ height: '220px' })
    expect(frame.querySelector('.absolute.inset-0')).not.toBeNull()
    expect((await card('Atividade por tempo')).querySelector('.relative')).toHaveStyle({ height: '250px' })
  })

  it('com largura medida não sobra esqueleto sobre o gráfico', async () => {
    serve(12, 5, [point(1, 12, 5)])
    renderWithIntl(<Dashboard />)

    const donut = await card('Sessões por tipo')
    await waitFor(() => expect(donut.querySelector('.relative .absolute.inset-0')).toBeNull())
  })
})
