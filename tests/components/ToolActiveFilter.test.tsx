import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, expect, it, vi } from 'vitest'

import { ToolManagement } from '@/components/management/tools/ToolManagement'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// QA1-10 (#21): "Apenas ativos" em Tools, igual ao de Agents e Teams.

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

const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Tempo',
  route: 'https://clima.example.test',
  http_method: 'GET',
  parameters: [],
  active: true
}

const queries: string[] = []
const serveTools = (items: object[]) =>
  server.use(
    http.get('*/api/tools', ({ request }) => {
      queries.push(new URL(request.url).search)
      return HttpResponse.json({
        success: true,
        data: { data: items, total: items.length, page: 1, limit: 100, totalPages: 1 }
      })
    })
  )

it('o switch manda active=true ao BFF, mostra só o total e o vazio "Nenhuma tool ativa"; limpar volta tudo', async () => {
  queries.length = 0
  serveTools([tool])
  const user = userEvent.setup()
  renderWithIntl(<ToolManagement />)
  await screen.findAllByRole('link', { name: 'Clima' })
  expect(screen.getByText('Mostrar apenas tools ativas')).toBeVisible()

  serveTools([])
  await user.click(screen.getByRole('switch', { name: 'Apenas ativos' }))

  expect(await screen.findByRole('heading', { name: 'Nenhuma tool ativa' })).toBeInTheDocument()
  expect(queries.at(-1)).toBe('?limit=100&active=true')
  const region = document.querySelector('[aria-live="polite"][aria-atomic="true"]')
  expect(Array.from(region?.children ?? []).map((chip) => chip.textContent)).toEqual(['0 tools'])

  serveTools([tool])
  await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(screen.getByRole('switch', { name: 'Apenas ativos' })).not.toBeChecked()
  await waitFor(() => expect(queries.at(-1)).toBe('?limit=100'))
  expect(await screen.findAllByRole('link', { name: 'Clima' })).not.toHaveLength(0)
})

it('EN: o filtro e o vazio no idioma', async () => {
  serveTools([])
  const user = userEvent.setup()
  renderWithIntl(<ToolManagement />, { locale: 'en' })

  await user.click(await screen.findByRole('switch', { name: 'Active only' }))

  expect(screen.getByText('Show active tools only')).toBeVisible()
  expect(await screen.findByRole('heading', { name: 'No active tools' })).toBeInTheDocument()
})
