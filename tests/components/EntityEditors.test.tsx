import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { ToolEditor } from '@/components/management/tools/ToolEditor'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// Sem o App Router no jsdom (next/navigation 15.2): só o push é observado.
const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

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
  id: 'agente alfa/1',
  nome: 'Agente Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  descricao: 'Responde perguntas',
  prompt: 'Você é o Alfa.',
  active: true,
  tools_ids: []
}

const noTools = http.get('*/api/tools', () =>
  HttpResponse.json({
    success: true,
    data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
  })
)

describe('AgentEditor', () => {
  it('carrega o agente pelo id codificado e mostra o editor preenchido', async () => {
    const requested: string[] = []
    server.use(
      noTools,
      http.get('*/api/agents/:id', ({ request }) => {
        requested.push(new URL(request.url).pathname)
        return HttpResponse.json({ success: true, data: agent })
      })
    )
    renderWithIntl(<AgentEditor id={agent.id} />)

    expect(screen.getByText('Carregando agente…').closest('[aria-busy="true"]')).not.toBeNull()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Editar agente' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/ID do agente/)).toHaveValue(agent.id)
    expect(requested).toEqual(['/api/agents/agente%20alfa%2F1'])
  })

  it('"Voltar" e "Cancelar" são links para a lista; salvar volta para /agents', async () => {
    const push = vi.spyOn(router, 'push')
    server.use(
      noTools,
      http.get('*/api/agents/:id', () =>
        HttpResponse.json({ success: true, data: agent })
      ),
      http.put('*/api/agents/:id', ({ params }) =>
        HttpResponse.json({ success: params.id === agent.id, message: 'ok' })
      )
    )
    const user = userEvent.setup()
    renderWithIntl(<AgentEditor id={agent.id} />)

    await screen.findByRole('heading', { name: 'Editar agente' })
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/agents')
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/agents')

    await user.click(screen.getByRole('button', { name: /salvar|atualizar/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/agents'))
  })

  it('sem id mostra o form de criação, sem buscar agente', async () => {
    server.use(noTools)
    renderWithIntl(<AgentEditor />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Novo agente' })
    ).toBeInTheDocument()
  })

  it('404: bloco de alerta com o id e o link de volta', async () => {
    server.use(
      http.get('*/api/agents/:id', () =>
        HttpResponse.json(
          { success: false, error: 'Agente não encontrado' },
          { status: 404 }
        )
      )
    )
    renderWithIntl(<AgentEditor id="nao-existe" />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Agente não encontrado')).toBeInTheDocument()
    expect(within(alert).getByText('nao-existe')).toBeInTheDocument()
    expect(
      within(alert).getByRole('link', { name: 'Voltar para agentes' })
    ).toHaveAttribute('href', '/agents')
  })

  it('outro erro: "Não foi possível carregar o agente" com o código', async () => {
    server.use(
      http.get('*/api/agents/:id', () =>
        HttpResponse.json(
          { success: false, error: 'Erro interno do servidor' },
          { status: 500 }
        )
      )
    )
    renderWithIntl(<AgentEditor id="agente-alfa" />)

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('Não foi possível carregar o agente')
    ).toBeInTheDocument()
    expect(within(alert).getByText('código 500')).toBeInTheDocument()
  })
})

describe('ToolEditor', () => {
  it('404: "Tool não encontrada" e o link para tools', async () => {
    server.use(
      http.get('*/api/tools/:id', () =>
        HttpResponse.json(
          { success: false, error: 'Tool não encontrada' },
          { status: 404 }
        )
      )
    )
    renderWithIntl(<ToolEditor id="nao-existe" />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Tool não encontrada')).toBeInTheDocument()
    expect(within(alert).getByText('nao-existe')).toBeInTheDocument()
    expect(
      within(alert).getByRole('link', { name: 'Voltar para tools' })
    ).toHaveAttribute('href', '/tools')
  })

  it('carrega a tool e mostra o editor', async () => {
    server.use(
      http.get('*/api/tools/:id', () =>
        HttpResponse.json({
          success: true,
          data: {
            id: 'clima',
            name: 'Clima',
            description: 'Previsão do tempo',
            route: 'https://api.example.test/clima',
            http_method: 'GET',
            parameters: []
          }
        })
      )
    )
    renderWithIntl(<ToolEditor id="clima" />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Editar tool' })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/tools')
  })
})
