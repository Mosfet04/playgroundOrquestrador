import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentManagement } from '@/components/management/agents/AgentManagement'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

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

const agent = {
  id: 'agente alfa',
  nome: 'Agente Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  descricao: 'Responde perguntas',
  prompt: 'Você é o Alfa.',
  active: true,
  tools_ids: []
}

const serveAgents = (agents: (typeof agent)[]) =>
  server.use(
    http.get('*/api/agents', () =>
      HttpResponse.json({
        success: true,
        data: { data: agents, total: agents.length, page: 1, limit: 10, totalPages: 1 }
      })
    )
  )

describe('AgentManagement: links da lista (D-P1-03-2)', () => {
  it('o nome leva a /agents/<id> com o id codificado, na tabela e na linha do celular; sem editar/excluir na linha (P1-05b)', async () => {
    serveAgents([agent])
    renderWithIntl(<AgentManagement />)

    const links = await screen.findAllByRole('link', { name: 'Agente Alfa' })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/agents/agente%20alfa',
      '/agents/agente%20alfa'
    ])
    expect(screen.queryByRole('link', { name: 'Editar agente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir agente' })).not.toBeInTheDocument()
  })

  it('"Novo agente" e "Criar primeiro agente" levam a /agents/new', async () => {
    serveAgents([])
    renderWithIntl(<AgentManagement />)

    expect(
      await screen.findByRole('link', { name: 'Criar primeiro agente' })
    ).toHaveAttribute('href', '/agents/new')
    expect(screen.getByRole('link', { name: 'Novo agente' })).toHaveAttribute(
      'href',
      '/agents/new'
    )
  })
})
