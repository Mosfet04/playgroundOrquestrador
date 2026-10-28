import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { ToolEditor } from '@/components/management/tools/ToolEditor'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P1-05b (V-P1-05b-7): "Excluir" no rodapé do editor /{id}, nunca em /new.
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
  tools_ids: [],
  version: 4
}
const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão do tempo',
  route: 'https://api.example.test/clima',
  http_method: 'GET',
  parameters: []
}

const noTools = http.get('*/api/tools', () =>
  HttpResponse.json({
    success: true,
    data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
  })
)
const serveAgent = http.get('*/api/agents/:id', () =>
  HttpResponse.json({ success: true, data: agent })
)

function renderAgentEditor(id?: string) {
  renderWithIntl(
    <>
      <AgentEditor id={id} />
      <Toaster />
    </>
  )
}

describe('excluir no editor de agente', () => {
  it('/agents/new não tem "Excluir agente"', async () => {
    server.use(noTools)
    renderAgentEditor()

    await screen.findByRole('heading', { level: 1, name: 'Novo agente' })
    expect(screen.queryByRole('button', { name: 'Excluir agente' })).not.toBeInTheDocument()
  })

  it('confirmar: DELETE no id codificado com a versão no If-Match, toast "Agente excluído" e volta para /agents', async () => {
    const push = vi.spyOn(router, 'push')
    const deleted: string[] = []
    server.use(
      noTools,
      serveAgent,
      http.delete('*/api/agents/:id', ({ request }) => {
        deleted.push(new URL(request.url).pathname, request.headers.get('if-match') ?? '')
        return HttpResponse.json({ success: true, message: 'ok' })
      })
    )
    const user = userEvent.setup()
    renderAgentEditor(agent.id)

    await user.click(await screen.findByRole('button', { name: 'Excluir agente' }))
    const dialog = screen.getByRole('dialog', { name: 'Excluir agente' })
    expect(dialog).toHaveTextContent(
      'Tem certeza que deseja excluir o agente "Agente Alfa"? Esta ação não pode ser desfeita.'
    )
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText('Agente excluído')).toBeInTheDocument()
    expect(push).toHaveBeenCalledWith('/agents')
    expect(deleted).toEqual(['/api/agents/agente%20alfa%2F1', '"4"'])
  })

  it('Cancelar e Esc fecham o Dialog e devolvem o foco a "Excluir agente"', async () => {
    server.use(noTools, serveAgent)
    const user = userEvent.setup()
    renderAgentEditor(agent.id)

    const trigger = await screen.findByRole('button', { name: 'Excluir agente' })
    await user.click(trigger)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())

    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it.each([
    [500, 'Não foi possível excluir o agente (código 500)'],
    [404, 'Agente não encontrado']
  ])('falha %i: Dialog fecha, toast "%s" e o editor fica com o form intacto', async (status, text) => {
    const push = vi.spyOn(router, 'push')
    server.use(
      noTools,
      serveAgent,
      http.delete('*/api/agents/:id', () =>
        HttpResponse.json({ success: false, error: 'cru' }, { status })
      )
    )
    const user = userEvent.setup()
    renderAgentEditor(agent.id)

    const name = await screen.findByLabelText('Nome *')
    await user.clear(name)
    await user.type(name, 'Alfa editado')
    await user.click(screen.getByRole('button', { name: 'Excluir agente' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('cru')).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nome *')).toHaveValue('Alfa editado')
  })

  it('"Excluir agente" fica desabilitado enquanto salva', async () => {
    server.use(
      noTools,
      serveAgent,
      http.put('*/api/agents/:id', () => new Promise<Response>(() => {}))
    )
    const user = userEvent.setup()
    renderAgentEditor(agent.id)

    const remove = await screen.findByRole('button', { name: 'Excluir agente' })
    expect(remove).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(remove).toBeDisabled())
  })
})

describe('excluir no editor de tool', () => {
  it('/tools/new não tem "Excluir tool"', () => {
    renderWithIntl(<ToolEditor />)

    expect(screen.getByRole('heading', { level: 1, name: 'Nova tool' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir tool' })).not.toBeInTheDocument()
  })

  it('confirmar: toast "Tool excluída" e volta para /tools', async () => {
    const push = vi.spyOn(router, 'push')
    server.use(
      http.get('*/api/tools/:id', () => HttpResponse.json({ success: true, data: tool })),
      http.delete('*/api/tools/:id', () => HttpResponse.json({ success: true }))
    )
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <ToolEditor id="clima" />
        <Toaster />
      </>
    )

    await user.click(await screen.findByRole('button', { name: 'Excluir tool' }))
    const dialog = screen.getByRole('dialog', { name: 'Excluir tool' })
    expect(dialog).toHaveTextContent('"Clima"')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText('Tool excluída')).toBeInTheDocument()
    expect(push).toHaveBeenCalledWith('/tools')
  })
})
