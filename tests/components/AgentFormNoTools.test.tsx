import { screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { beforeAll, expect, it, vi } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// QA1-10 (#25): o card "Tools disponíveis" sem tools diz o que fazer e leva a
// /tools/new; enquanto as tools carregam, mostra um esqueleto (não o vazio).

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

const emptyTools = http.get('*/api/tools', () =>
  HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })
)

it('sem tools: título do card, texto, dica e o link "Criar tool" para /tools/new', async () => {
  server.use(emptyTools)
  renderWithIntl(<AgentForm onSuccess={() => {}} />)

  expect(await screen.findByText('Nenhuma tool disponível.')).toBeVisible()
  expect(screen.getByText('Crie uma tool para o agente poder usá-la.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Criar tool' })).toHaveAttribute('href', '/tools/new')
  expect(screen.getByText('Tools disponíveis')).toBeVisible()
})

it('carregando as tools não mostra o vazio nem o link', async () => {
  server.use(
    http.get('*/api/tools', async () => {
      await delay('infinite')
      return HttpResponse.json({})
    })
  )
  renderWithIntl(<AgentForm onSuccess={() => {}} />)

  await screen.findByText('Tools disponíveis')
  expect(screen.queryByText('Nenhuma tool disponível.')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Criar tool' })).not.toBeInTheDocument()
})

it('falha ao carregar as tools: sai do esqueleto (segue o vazio de hoje)', async () => {
  server.use(http.get('*/api/tools', () => HttpResponse.error()))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  renderWithIntl(<AgentForm onSuccess={() => {}} />)

  expect(await screen.findByText('Nenhuma tool disponível.')).toBeVisible()
})

it('EN: texto, dica e link no idioma', async () => {
  server.use(emptyTools)
  renderWithIntl(<AgentForm onSuccess={() => {}} />, { locale: 'en' })

  expect(await screen.findByText('No tools available.')).toBeVisible()
  expect(screen.getByText('Create a tool so the agent can use it.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Create tool' })).toHaveAttribute('href', '/tools/new')
})
