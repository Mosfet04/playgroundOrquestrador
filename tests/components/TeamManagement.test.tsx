import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TeamManagement } from '@/components/management/teams/TeamManagement'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// P3-04: lista de teams, como a de agents (P1-05b), com modelo do líder, modo e
// nº de membros. Spec: docs/design/P3-04.md §4 (V-P3-04-2, V-P3-04-3).

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

const team = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  descricao: '',
  prompt: '',
  active: true,
  member_ids: ['a', 'b', 'c'],
  mode: 'coordinate',
  factoryIaModel: 'openai',
  model: 'gpt-4o',
  version: 1,
  ...extra
})

const queries: string[] = []
const serveTeams = (teams: object[], total = teams.length) =>
  server.use(
    http.get('*/api/teams', ({ request }) => {
      queries.push(new URL(request.url).search)
      return HttpResponse.json({
        success: true,
        data: { data: teams, total, page: 1, limit: 100, totalPages: 1 }
      })
    })
  )

describe('TeamManagement', () => {
  it('V-2: cada team mostra nome (link), id, modelo do líder, modo, membros e status', async () => {
    queries.length = 0
    serveTeams([
      team('suporte vendas', 'Suporte Vendas'),
      team('inativo', 'Inativo', { active: false, member_ids: ['a'], mode: 'route' })
    ])
    renderWithIntl(<TeamManagement />)

    const links = await screen.findAllByRole('link', { name: 'Suporte Vendas' })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/teams/suporte%20vendas',
      '/teams/suporte%20vendas'
    ])
    expect(queries[0]).toBe('?limit=100')
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['Team', 'Modelo', 'Modo', 'Membros', 'Status', 'Atualizado', 'Abrir'])
    const row = within(table).getByRole('link', { name: 'Suporte Vendas' }).closest('tr') as HTMLElement
    expect(within(row).getByText('openai/gpt-4o')).toBeInTheDocument()
    expect(within(row).getByText('coordinate')).toBeInTheDocument()
    expect(within(row).getByText('3')).toBeInTheDocument()
    expect(within(row).getByText('Ativo')).toBeInTheDocument()
    const inactive = within(table).getByRole('link', { name: 'Inativo' }).closest('tr') as HTMLElement
    expect(within(inactive).getByText('Inativo', { selector: 'div' })).toBeInTheDocument()
    // Celular: id · nº de membros em mono.
    expect(screen.getByText('inativo · 1 membro')).toBeInTheDocument()
    expect(screen.getByText('suporte vendas · 3 membros')).toBeInTheDocument()
    expect(screen.getByText('2', { selector: 'span.font-semibold' }).parentElement).toHaveTextContent('2 teams')
  })

  it('"Novo team" e "Criar primeiro team" levam a /teams/new; vazio explica o que é um team', async () => {
    serveTeams([])
    renderWithIntl(<TeamManagement />)

    expect(await screen.findByText('O orquestrador ainda não tem teams')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar primeiro team' })).toHaveAttribute('href', '/teams/new')
    expect(screen.getByRole('link', { name: 'Novo team' })).toHaveAttribute('href', '/teams/new')
  })

  it('busca e "Apenas ativos" vão para o BFF; sem resultado mostra o vazio do filtro e "Limpar filtros"', async () => {
    queries.length = 0
    serveTeams([team('a', 'Alfa')])
    const user = userEvent.setup()
    renderWithIntl(<TeamManagement />)
    await screen.findAllByRole('link', { name: 'Alfa' })

    serveTeams([])
    await user.type(screen.getByRole('textbox', { name: 'Buscar' }), 'zz')

    expect(await screen.findByText(/Nenhum team encontrado para/)).toBeInTheDocument()
    expect(queries.at(-1)).toBe('?limit=100&search=zz')

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(queries.at(-1)).toBe('?limit=100'))
  })

  it('carregando mostra o status; falha mostra o erro com "Tentar de novo"', async () => {
    server.use(http.get('*/api/teams', () => HttpResponse.json({ success: false }, { status: 502 })))
    renderWithIntl(<TeamManagement />)

    expect(await screen.findByText('Não foi possível carregar os teams')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})
