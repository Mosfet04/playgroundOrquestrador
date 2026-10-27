import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// Teste longo de interação: com a suíte em paralelo passa dos 5 s padrão.
const LONG = 15_000

// 101 tools: com limit=100 a última só vem na página 2.
const tools = Array.from({ length: 101 }, (_, index) => {
  const number = String(index + 1).padStart(3, '0')
  return {
    id: `tool-${number}`,
    name: `Ferramenta ${number}`,
    description: `Descrição ${number}`
  }
})

// Mesma paginação de GET /api/tools (page e limit, limit padrão 10).
function serveToolsPaginated() {
  server.use(
    http.get('*/api/tools', ({ request }) => {
      const params = new URL(request.url).searchParams
      const page = Number(params.get('page') ?? '1')
      const limit = Number(params.get('limit') ?? '10')
      return HttpResponse.json({
        success: true,
        data: {
          data: tools.slice((page - 1) * limit, page * limit),
          total: tools.length,
          page,
          limit,
          totalPages: Math.ceil(tools.length / limit)
        }
      })
    })
  )
}

// O Switch do Radix mede o tamanho com ResizeObserver, que o jsdom não tem.
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

describe('AgentForm', () => {
  it('lista todas as tools, inclusive além da 1ª página', async () => {
    serveToolsPaginated()

    renderWithIntl(<AgentForm onSuccess={() => {}} />)

    // getByLabelText: com 101 tools, getByRole varre a árvore de acessibilidade
    // a cada consulta e estoura o prazo com a suíte inteira em paralelo.
    expect(await screen.findByLabelText(/Ferramenta 101/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Ferramenta 011/)).toBeInTheDocument()
    expect(screen.getAllByLabelText(/^Ferramenta/)).toHaveLength(tools.length)
  }, LONG)

  it('dá nome aos switches pelo Label (F-05)', async () => {
    serveToolsPaginated()

    renderWithIntl(<AgentForm onSuccess={() => {}} />)

    expect(
      await screen.findByRole('switch', { name: 'Agente ativo' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Habilitar RAG' })
    ).toBeInTheDocument()
  })
})
