import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { TeamEditor } from '@/components/management/teams/TeamEditor'
import { ToolEditor } from '@/components/management/tools/ToolEditor'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// P3-06 (D-P3-06-2): Desativar e Reativar no rodapé do editor, no lugar do
// switch "Ativo"; 409 e 412 no Dialog da ação. Spec: docs/design/P3-06.md §4
// (V-P3-06-1 a 9).
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
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

const agent = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: 'Ajuda',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: ['clima'],
  version: 4
}
const inactive = { ...agent, active: false, version: 5 }

const tools = http.get('*/api/tools', () =>
  HttpResponse.json({
    success: true,
    data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
  })
)
const serveAgent = (doc: object = agent) =>
  http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: doc }))

type Call = { method: string; url: string; ifMatch: string | null; body?: Record<string, unknown> }
function record(calls: Call[], method: 'delete' | 'put', respond: () => Response, path = 'agents') {
  return http[method](`*/api/${path}/:id`, async ({ request }) => {
    const url = new URL(request.url)
    calls.push({
      method: request.method,
      url: `${url.pathname}${url.search}`,
      ifMatch: request.headers.get('if-match'),
      ...(method === 'put' ? { body: (await request.json()) as Record<string, unknown> } : {})
    })
    return respond()
  })
}

function renderAgent() {
  renderWithIntl(
    <>
      <AgentEditor id={agent.id} />
      <Toaster />
    </>
  )
}

// "Fechar" do rodapé (o X do Dialog tem o mesmo nome acessível).
const footerClose = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('button', { name: 'Fechar' })
    .find((button) => !button.querySelector('svg')) as HTMLElement

const written = (doc: object) => () => HttpResponse.json({ success: true, data: doc })
const refused = (status: number, body: object = {}) => () =>
  HttpResponse.json({ success: false, error: 'x', ...body }, { status })

describe('estado e botões do editor (V-P3-06-1 a 3)', () => {
  it('o h1 vem com o badge Ativo; Desativar e Excluir à esquerda; nenhum switch "Agente ativo"', async () => {
    server.use(tools, serveAgent())
    renderAgent()

    await screen.findByRole('heading', { level: 1, name: 'Editar agente' })
    expect(screen.getByText('Ativo', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desativar agente' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Excluir agente' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Reativar agente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /ativo/i })).not.toBeInTheDocument()
  })

  it('agent inativo: badge Inativo e "Reativar agente" no lugar de Desativar', async () => {
    server.use(tools, serveAgent(inactive))
    renderAgent()

    await screen.findByRole('heading', { level: 1, name: 'Editar agente' })
    expect(screen.getByText('Inativo', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reativar agente' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Desativar agente' })).not.toBeInTheDocument()
  })

  it('/new não tem badge, Desativar nem Reativar', async () => {
    server.use(tools)
    renderWithIntl(<AgentEditor />)

    await screen.findByRole('heading', { level: 1, name: 'Novo agente' })
    expect(screen.queryByText('Ativo', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Desativar|Reativar)/ })).not.toBeInTheDocument()
  })
})

describe('Desativar (V-P3-06-5, 6)', () => {
  it('confirma no Dialog (não destrutivo), DELETE ?soft=true com a versão; a página fica, badge Inativo e foco em Reativar', async () => {
    const push = vi.spyOn(router, 'push')
    const calls: Call[] = []
    server.use(tools, serveAgent(), record(calls, 'delete', written(inactive)))
    const user = userEvent.setup()
    renderAgent()

    await user.click(await screen.findByRole('button', { name: 'Desativar agente' }))
    const dialog = screen.getByRole('dialog', { name: 'Desativar agente' })
    expect(dialog).toHaveTextContent(
      'O orquestrador deixa de carregar o agente “Assistente”, mas a configuração continua salva. Você pode reativá-lo aqui quando quiser.'
    )
    expect(within(dialog).queryByText(/edições não salvas/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }))

    expect(await screen.findByText('Agente desativado')).toBeInTheDocument()
    expect(calls).toEqual([
      { method: 'DELETE', url: '/api/agents/assistente?soft=true', ifMatch: '"4"' }
    ])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByText('Inativo', { exact: true })).toBeInTheDocument()
    const reactivate = screen.getByRole('button', { name: 'Reativar agente' })
    await waitFor(() => expect(reactivate).toHaveFocus())
  })

  it('com edições não salvas: nota no Dialog; o formulário fica intacto e o próximo Salvar leva a versão nova e active false', async () => {
    const puts: Call[] = []
    server.use(
      tools,
      serveAgent(),
      record([], 'delete', written(inactive)),
      record(puts, 'put', written(inactive))
    )
    const user = userEvent.setup()
    renderAgent()

    const name = await screen.findByLabelText('Nome *')
    await user.clear(name)
    await user.type(name, 'Assistente editado')
    await user.click(screen.getByRole('button', { name: 'Desativar agente' }))
    const dialog = screen.getByRole('dialog', { name: 'Desativar agente' })
    expect(dialog).toHaveTextContent(
      'Você tem edições não salvas. Elas continuam no formulário; esta ação não as grava.'
    )
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }))
    await screen.findByRole('button', { name: 'Reativar agente' })

    expect(screen.getByLabelText('Nome *')).toHaveValue('Assistente editado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0].ifMatch).toBe('"5"')
    expect(puts[0].body).toMatchObject({ nome: 'Assistente editado', active: false })
  })

  it('Cancelar fecha o Dialog sem chamar o BFF e devolve o foco a "Desativar agente"', async () => {
    const calls: Call[] = []
    server.use(tools, serveAgent(), record(calls, 'delete', written(inactive)))
    const user = userEvent.setup()
    renderAgent()

    const trigger = await screen.findByRole('button', { name: 'Desativar agente' })
    await user.click(trigger)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(calls).toEqual([])
  })

  it('agent em team (409): o Dialog vira "Agente em uso por teams" com os links e só Fechar; o badge segue Ativo', async () => {
    server.use(
      tools,
      serveAgent(),
      record([], 'delete', refused(409, { error: 'conflict', used_by: { teams: ['suporte'] } }))
    )
    const user = userEvent.setup()
    renderAgent()

    await user.click(await screen.findByRole('button', { name: 'Desativar agente' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))

    const dialog = await screen.findByRole('dialog', { name: 'Agente em uso por teams' })
    expect(within(dialog).getByRole('link', { name: /suporte/ })).toHaveAttribute('href', '/teams/suporte')
    expect(footerClose(dialog)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument()
    expect(screen.getByText('Ativo', { exact: true })).toBeInTheDocument()
  })

  it.each([
    [500, 'Não foi possível desativar o agente (código 500)'],
    [404, 'Agente não encontrado']
  ])('falha %i: toast "%s" e o Dialog fecha', async (status, text) => {
    server.use(tools, serveAgent(), record([], 'delete', refused(status)))
    const user = userEvent.setup()
    renderAgent()

    await user.click(await screen.findByRole('button', { name: 'Desativar agente' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))

    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desativar agente' })).toBeInTheDocument()
  })
})

describe('Dialog de confirmação (design QA)', () => {
  it.each([
    ['Desativar agente', 'Desativar'],
    ['Excluir agente', 'Excluir']
  ])('%s: 16 px entre o texto e os botões, e botões h-10 abaixo de sm', async (label, confirm) => {
    server.use(tools, serveAgent())
    const user = userEvent.setup()
    renderAgent()

    await user.click(await screen.findByRole('button', { name: label }))
    const dialog = screen.getByRole('dialog')

    const buttons = within(dialog).getByRole('button', { name: confirm }).parentElement
    expect(buttons).toHaveClass('mt-4')
    for (const name of ['Cancelar', confirm])
      expect(within(dialog).getByRole('button', { name })).toHaveClass('h-10', 'sm:h-9')
  })

  it('o aviso de 412 também: margem e botões h-10', async () => {
    server.use(tools, serveAgent(), record([], 'delete', refused(412, { error: 'version_conflict' })))
    const user = userEvent.setup()
    renderAgent()

    await user.click(await screen.findByRole('button', { name: 'Desativar agente' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))
    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })

    expect(within(dialog).getByRole('button', { name: 'Recarregar' }).parentElement).toHaveClass('mt-4')
    expect(within(dialog).getByRole('button', { name: 'Recarregar' })).toHaveClass('h-10', 'sm:h-9')
    expect(footerClose(dialog)).toHaveClass('h-10', 'sm:h-9')
  })
})

describe('Reativar (V-P3-06-7)', () => {
  it('sem Dialog: PUT do documento carregado com active true (sem as edições do formulário), toast, badge Ativo e foco no botão', async () => {
    const puts: Call[] = []
    server.use(tools, serveAgent(inactive), record(puts, 'put', written({ ...agent, version: 6 })))
    const user = userEvent.setup()
    renderAgent()

    const name = await screen.findByLabelText('Nome *')
    await user.clear(name)
    await user.type(name, 'Edição escondida')
    await user.click(screen.getByRole('button', { name: 'Reativar agente' }))

    expect(await screen.findByText('Agente reativado')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(puts).toHaveLength(1)
    expect(puts[0].ifMatch).toBe('"5"')
    expect(puts[0].body).toMatchObject({ nome: 'Assistente', active: true, tools_ids: ['clima'] })
    expect(screen.getByText('Ativo', { exact: true })).toBeInTheDocument()
    const deactivate = screen.getByRole('button', { name: 'Desativar agente' })
    await waitFor(() => expect(deactivate).toHaveFocus())
    expect(screen.getByLabelText('Nome *')).toHaveValue('Edição escondida')
  })

  it('mostra "Reativando…" e desabilita o resto do rodapé durante o PUT', async () => {
    server.use(tools, serveAgent(inactive), http.put('*/api/agents/:id', () => new Promise<Response>(() => {})))
    const user = userEvent.setup()
    renderAgent()

    await user.click(await screen.findByRole('button', { name: 'Reativar agente' }))

    expect(await screen.findByRole('button', { name: 'Reativando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Excluir agente' })).toBeDisabled()
    // O resto do rodapé também: Salvar não dispara outro PUT com o mesmo If-Match.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('falha: toast com o código', async () => {
    server.use(tools, serveAgent(inactive), record([], 'put', refused(422, { error: 'invalid_config' })))
    const user = userEvent.setup()
    renderAgent()

    await user.click(await screen.findByRole('button', { name: 'Reativar agente' }))

    expect(await screen.findByText('Não foi possível reativar o agente (código 422)')).toBeInTheDocument()
    expect(screen.getByText('Inativo', { exact: true })).toBeInTheDocument()
  })
})

describe('412 em Excluir, Desativar e Reativar (V-P3-06-9)', () => {
  it.each([
    ['delete', 'Excluir agente', 'Nada foi excluído.'],
    ['deactivate', 'Desativar agente', 'Nada foi desativado.']
  ] as const)('%s: aviso "O agente mudou", Fechar com o foco e volta ao botão', async (_, label, nothing) => {
    server.use(tools, serveAgent(), record([], 'delete', refused(412, { error: 'version_conflict' })))
    const user = userEvent.setup()
    renderAgent()

    const trigger = await screen.findByRole('button', { name: label })
    await user.click(trigger)
    const confirm = screen.getByRole('dialog')
    await user.click(within(confirm).getByRole('button', { name: label.split(' ')[0] === 'Excluir' ? 'Excluir' : 'Desativar' }))

    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })
    expect(dialog).toHaveTextContent(nothing)
    const close = footerClose(dialog)
    await waitFor(() => expect(close).toHaveFocus())
    expect(within(dialog).getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
    expect(screen.queryByText(/código 412/)).not.toBeInTheDocument()

    await user.click(close)
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('Reativar abre o aviso sozinho; Recarregar refaz o carregamento e mostra a versão atual', async () => {
    let reads = 0
    server.use(
      tools,
      http.get('*/api/agents/:id', () => {
        reads++
        return HttpResponse.json({ success: true, data: reads === 1 ? inactive : { ...agent, version: 7 } })
      }),
      record([], 'put', refused(412, { error: 'version_conflict' }))
    )
    const user = userEvent.setup()
    renderAgent()

    await user.click(await screen.findByRole('button', { name: 'Reativar agente' }))
    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })
    expect(dialog).toHaveTextContent('Nada foi reativado.')
    await user.click(within(dialog).getByRole('button', { name: 'Recarregar' }))

    expect(await screen.findByRole('button', { name: 'Desativar agente' })).toBeInTheDocument()
    expect(screen.getByText('Ativo', { exact: true })).toBeInTheDocument()
    expect(reads).toBe(2)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Editar agente' })).toHaveFocus()
    )
  })

  it('com o formulário alterado, o aviso diz que Recarregar descarta as edições', async () => {
    server.use(tools, serveAgent(), record([], 'delete', refused(412, { error: 'version_conflict' })))
    const user = userEvent.setup()
    renderAgent()

    await user.type(await screen.findByLabelText('Nome *'), ' x')
    await user.click(screen.getByRole('button', { name: 'Desativar agente' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))

    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })
    expect(dialog).toHaveTextContent('Recarregar descarta as edições não salvas do formulário.')
  })
})

describe('team e tool', () => {
  const team = {
    id: 'suporte',
    nome: 'Suporte',
    descricao: '',
    prompt: '',
    active: true,
    member_ids: ['assistente'],
    mode: 'route',
    factoryIaModel: 'openai',
    model: 'gpt-4o',
    version: 2
  }
  const tool = {
    id: 'clima',
    name: 'Clima',
    description: 'Previsão',
    route: 'https://clima.example.com/v1',
    http_method: 'GET',
    parameters: [],
    headers: {},
    active: true,
    version: 3
  }
  const agents = http.get('*/api/agents', () =>
    HttpResponse.json({
      success: true,
      data: { data: [agent], total: 1, page: 1, limit: 100, totalPages: 1 }
    })
  )

  it('team: desativa com ?soft=true e o texto do team', async () => {
    const calls: Call[] = []
    server.use(
      agents,
      http.get('*/api/teams/:id', () => HttpResponse.json({ success: true, data: team })),
      record(calls, 'delete', written({ ...team, active: false, version: 3 }), 'teams')
    )
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <TeamEditor id="suporte" />
        <Toaster />
      </>
    )

    await user.click(await screen.findByRole('button', { name: 'Desativar team' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Desativar team' })).getByRole('button', { name: 'Desativar' }))

    expect(await screen.findByText('Team desativado')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ url: '/api/teams/suporte?soft=true', ifMatch: '"2"' })
    expect(screen.getByText('Inativo', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reativar team' })).toBeInTheDocument()
  })

  it('team: um 409 segue o toast genérico com o código (sem a lista de teams)', async () => {
    server.use(
      agents,
      http.get('*/api/teams/:id', () => HttpResponse.json({ success: true, data: team })),
      record([], 'delete', refused(409, { error: 'conflict' }), 'teams')
    )
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <TeamEditor id="suporte" />
        <Toaster />
      </>
    )

    await user.click(await screen.findByRole('button', { name: 'Desativar team' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))

    expect(await screen.findByText('Não foi possível desativar o team (código 409)')).toBeInTheDocument()
  })

  it('tool: badge Ativa, desativa e passa a mostrar "Reativar tool" e a Inativa', async () => {
    server.use(
      http.get('*/api/tools/:id', () => HttpResponse.json({ success: true, data: tool })),
      record([], 'delete', written({ ...tool, active: false, version: 4 }), 'tools')
    )
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <ToolEditor id="clima" />
        <Toaster />
      </>
    )

    expect(await screen.findByText('Ativa', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Tool ativa' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desativar tool' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))

    expect(await screen.findByText('Tool desativada')).toBeInTheDocument()
    expect(screen.getByText('Inativa', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reativar tool' })).toBeInTheDocument()
  })
})
