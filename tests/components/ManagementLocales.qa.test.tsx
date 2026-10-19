import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { AgentForm } from '@/components/management/agents/AgentForm'
import { AgentManagement } from '@/components/management/agents/AgentManagement'
import { Dashboard } from '@/components/management/dashboard/Dashboard'
import { ToolEditor } from '@/components/management/tools/ToolEditor'
import { ToolForm } from '@/components/management/tools/ToolForm'
import { ToolManagement } from '@/components/management/tools/ToolManagement'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'

// QA P1-04 (V-P1-04-5, V-P1-04-6 e erros pelo catálogo por status): as telas
// de gestão restantes nos dois idiomas, sem o texto cru do BFF.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))

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

const BFF_TEXT = 'mensagem crua do BFF <b>x</b>'
const PT_WORDS =
  /[áàâãéêíóôõúç]|\b(Salvar|Cancelar|Excluir|Excluindo|Buscar|Filtros|Voltar|Editar|Carregando|Novo|Nova|Ativo|Ativa|Inativo|Inativa|Descrição|Rota|Instruções|Parâmetros|Obrigatório|Nenhum|Nenhuma|Provedor|Modelo|Selecione|Mostrar|Ocultar)\b/
const EN_WORDS =
  /\b(Save|Cancel|Delete|Deleting|Search|Filters|Back|Edit|Loading|New|Active|Inactive|Description|Route|Instructions|Parameters|Required|None|Provider|Select|Show|Hide|Deletar|Provider)\b/

const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão',
  route: 'https://api.example.test/clima',
  http_method: 'GET',
  parameters: []
}
const agent = {
  id: 'alfa',
  nome: 'Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  active: true,
  tools_ids: []
}
const page = (data: unknown[]) => ({
  success: true,
  data: { data, total: data.length, page: 1, limit: 10, totalPages: 1 }
})
const noTools = http.get('*/api/tools', () => HttpResponse.json(page([])))
const body = () => document.body.textContent ?? ''

describe('ToolManagement', () => {
  const serveTool = () =>
    server.use(http.get('*/api/tools', () => HttpResponse.json(page([tool]))))

  it('EN: lista e filtros sem português', async () => {
    serveTool()
    renderWithIntl(<ToolManagement />, { locale: 'en' })

    await screen.findAllByRole('link', { name: 'Clima' })
    expect(screen.getByPlaceholderText('ID, name or description…')).toBeInTheDocument()
    expect(body()).not.toMatch(PT_WORDS)
  })

  it('pt-BR: lista e filtros sem inglês', async () => {
    serveTool()
    renderWithIntl(<ToolManagement />)

    await screen.findAllByRole('link', { name: 'Clima' })
    expect(body()).not.toMatch(EN_WORDS)
  })

  it('EN, estado vazio: título, descrição e ação em inglês', async () => {
    server.use(noTools)
    renderWithIntl(<ToolManagement />, { locale: 'en' })

    expect(await screen.findByText('The orchestrator has no tools yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create first tool' })).toBeInTheDocument()
    expect(body()).not.toMatch(PT_WORDS)
  })
})

// Excluir fica no editor desde o P1-05b.
describe('ToolEditor: excluir', () => {
  async function openDelete(locale: 'pt-BR' | 'en') {
    server.use(http.get('*/api/tools/:id', () => HttpResponse.json({ success: true, data: tool })))
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <ToolEditor id="clima" />
        <Toaster />
      </>,
      { locale }
    )
    await user.click(await screen.findByRole('button', { name: /^(Excluir|Delete) tool$/ }))
    return { user, dialog: screen.getByRole('dialog') }
  }

  it('EN: dialog de excluir sem português', async () => {
    const { dialog } = await openDelete('en')

    expect(dialog).toHaveAccessibleName('Delete tool')
    expect(dialog).toHaveTextContent(
      'Are you sure you want to delete the tool "Clima"? This action can\'t be undone.'
    )
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(dialog.textContent).not.toMatch(PT_WORDS)
  })

  it('pt-BR: dialog de excluir sem inglês nem "Deletar"', async () => {
    const { dialog } = await openDelete('pt-BR')

    expect(dialog).toHaveAccessibleName('Excluir tool')
    expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeInTheDocument()
    expect(dialog.textContent).not.toMatch(EN_WORDS)
  })

  it.each([
    ['pt-BR', 404, 'Tool não encontrada'],
    ['pt-BR', 500, 'Não foi possível excluir a tool (código 500)'],
    ['en', 404, 'Tool not found'],
    ['en', 500, "Couldn't delete the tool (code 500)"],
    ['en', 403, "Couldn't delete the tool (code 403)"]
  ] as const)('excluir (%s) com HTTP %i: "%s", sem o texto do BFF', async (locale, status, text) => {
    server.use(
      http.delete('*/api/tools/:id', () =>
        HttpResponse.json({ success: false, error: BFF_TEXT }, { status })
      )
    )
    const { user, dialog } = await openDelete(locale)
    await user.click(within(dialog).getByRole('button', { name: /^(Excluir|Delete)$/ }))

    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByText(BFF_TEXT, { exact: false })).not.toBeInTheDocument()
  })

  it('falha de rede ao excluir: só a mensagem da ação, sem código', async () => {
    server.use(http.delete('*/api/tools/:id', () => HttpResponse.error()))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user, dialog } = await openDelete('en')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText("Couldn't delete the tool")).toBeInTheDocument()
    expect(screen.queryByText(/code/)).not.toBeInTheDocument()
  })
})

describe('ToolForm: erros do POST pelo catálogo', () => {
  async function submit(locale: 'pt-BR' | 'en', reply: () => Response | Promise<Response>) {
    server.use(http.post('*/api/tools', reply))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <ToolForm onSuccess={() => {}} />
        <Toaster />
      </>,
      { locale }
    )
    await user.type(screen.getByLabelText(/^(ID da tool|Tool ID)/), 'clima')
    await user.type(screen.getByLabelText(/^(Nome|Name)/), 'Clima')
    await user.type(screen.getByLabelText(/^(Rota|Route)/), 'https://clima.example.com/v1')
    await user.type(screen.getByLabelText(/^(Descrição|Description)/), 'Previsão')
    await user.click(screen.getByRole('button', { name: /^(Salvar|Save)$/ }))
  }
  const fail = (status: number) => () =>
    HttpResponse.json({ success: false, error: BFF_TEXT }, { status })

  it('409 pt-BR: "Já existe uma tool com este ID"', async () => {
    await submit('pt-BR', fail(409))
    expect(await screen.findByText('Já existe uma tool com este ID')).toBeInTheDocument()
    expect(screen.queryByText(BFF_TEXT, { exact: false })).not.toBeInTheDocument()
  })

  it('409 EN: "A tool with this ID already exists"', async () => {
    await submit('en', fail(409))
    expect(await screen.findByText('A tool with this ID already exists')).toBeInTheDocument()
  })

  it('404 EN: "Tool not found"', async () => {
    await submit('en', fail(404))
    expect(await screen.findByText('Tool not found')).toBeInTheDocument()
  })

  it('500 pt-BR: "Não foi possível salvar a tool (código 500)"', async () => {
    await submit('pt-BR', fail(500))
    expect(
      await screen.findByText('Não foi possível salvar a tool (código 500)')
    ).toBeInTheDocument()
  })

  it('falha de rede EN: "Couldn\'t save the tool", sem código', async () => {
    await submit('en', () => HttpResponse.error())
    expect(await screen.findByText("Couldn't save the tool")).toBeInTheDocument()
  })
})

describe('AgentForm / AgentEditor / AgentManagement: casos extras', () => {
  it('falha de rede ao salvar agente (EN): só a mensagem da ação', async () => {
    server.use(
      noTools,
      http.post('*/api/agents', () => HttpResponse.error())
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <AgentForm onSuccess={() => {}} />
        <Toaster />
      </>,
      { locale: 'en' }
    )
    await user.type(screen.getByLabelText(/^Agent ID/), 'alfa')
    await user.type(screen.getByLabelText(/^Name/), 'Alfa')
    await user.type(screen.getByLabelText(/^Model \*/), 'llama3.2')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText("Couldn't save the agent")).toBeInTheDocument()
  })

  it('EN: o form de agente não tem português nos rótulos e placeholders', async () => {
    server.use(noTools)
    renderWithIntl(<AgentForm onSuccess={() => {}} />, { locale: 'en' })
    await screen.findByText('No tools available. Create tools first.')

    expect(body()).not.toMatch(PT_WORDS)
    const attrs = [...document.querySelectorAll('[placeholder],[aria-label],[title]')].flatMap(
      (el) => ['placeholder', 'aria-label', 'title'].map((a) => el.getAttribute(a) ?? '')
    )
    expect(attrs.join(' | ')).not.toMatch(PT_WORDS)
  })

  it('pt-BR: o form de agente não tem inglês nem "Provider"', async () => {
    server.use(noTools)
    renderWithIntl(<AgentForm onSuccess={() => {}} />)
    await screen.findByText('Nenhuma tool disponível. Crie tools primeiro.')

    expect(body()).not.toMatch(EN_WORDS)
    expect(body()).not.toMatch(/Provider\b/)
  })

  it('EN: o form de tool tem rótulos, placeholders e vazio sem português', async () => {
    renderWithIntl(<ToolForm onSuccess={() => {}} />, { locale: 'en' })

    expect(screen.getByText('No parameters configured')).toBeInTheDocument()
    expect(body()).not.toMatch(PT_WORDS)
    const attrs = [...document.querySelectorAll('[placeholder],[aria-label],[title]')].flatMap(
      (el) => ['placeholder', 'aria-label', 'title'].map((a) => el.getAttribute(a) ?? '')
    )
    expect(attrs.join(' | ')).not.toMatch(PT_WORDS)
  })

  it('pt-BR: o form de tool não tem inglês (termos do glossário à parte)', async () => {
    renderWithIntl(<ToolForm onSuccess={() => {}} />)
    expect(body()).not.toMatch(EN_WORDS)
  })

  it('EN: dialog de excluir do agente (no editor, P1-05b)', async () => {
    server.use(
      noTools,
      http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: agent }))
    )
    const user = userEvent.setup()
    renderWithIntl(<AgentEditor id="alfa" />, { locale: 'en' })

    await user.click(await screen.findByRole('button', { name: 'Delete agent' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete agent' })
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(dialog.textContent).not.toMatch(PT_WORDS)
  })

  it('EN, lista vazia de agentes', async () => {
    server.use(http.get('*/api/agents', () => HttpResponse.json(page([]))))
    renderWithIntl(<AgentManagement />, { locale: 'en' })

    expect(await screen.findByText('The orchestrator has no agents yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create first agent' })).toBeInTheDocument()
    expect(body()).not.toMatch(PT_WORDS)
  })
})

describe('EntityLoader nos dois idiomas', () => {
  it.each([
    ['AgentEditor', '*/api/agents/:id', <AgentEditor key="a" id="x" />],
    ['ToolEditor', '*/api/tools/:id', <ToolEditor key="t" id="x" />]
  ] as const)('%s EN: 404 com o link de volta e sem o texto do BFF', async (name, path, ui) => {
    server.use(
      http.get(path, () => HttpResponse.json({ success: false, error: BFF_TEXT }, { status: 404 }))
    )
    renderWithIntl(ui, { locale: 'en' })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading')).toHaveTextContent(
      name === 'AgentEditor' ? 'Agent not found' : 'Tool not found'
    )
    expect(
      within(alert).getByRole('link', {
        name: name === 'AgentEditor' ? 'Back to agents' : 'Back to tools'
      })
    ).toBeInTheDocument()
    expect(alert).not.toHaveTextContent('BFF')
  })

  it('ToolEditor EN: 500 mostra "Couldn\'t load the tool" e "code 500"', async () => {
    server.use(
      http.get('*/api/tools/:id', () =>
        HttpResponse.json({ success: false, error: BFF_TEXT }, { status: 500 })
      )
    )
    renderWithIntl(<ToolEditor id="x" />, { locale: 'en' })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load the tool")
    expect(alert).toHaveTextContent('code 500')
    expect(alert).not.toHaveTextContent('BFF')
  })

  it('ToolEditor EN: carregando em inglês', () => {
    server.use(http.get('*/api/tools/:id', () => new Promise(() => {})))
    renderWithIntl(<ToolEditor id="x" />, { locale: 'en' })
    expect(screen.getByText('Loading tool…').closest('[aria-busy="true"]')).not.toBeNull()
  })
})

describe('Dashboard: idioma completo', () => {
  const stats = {
    activeAgents: 1,
    totalAgents: 1,
    uniqueUsers: 1,
    totalSessions: 1,
    totalAgentSessions: 1,
    totalTeamSessions: 0,
    sessionsInPeriod: 1,
    totalTokens: 1000,
    models: [],
    embeddingModels: [],
    activityOverTime: []
  }
  const serve = () =>
    server.use(
      http.get('*/api/dashboard/stats', () => HttpResponse.json({ success: true, data: stats })),
      http.get('*/api/dashboard/tokens', () => HttpResponse.json({ success: true, data: [] }))
    )

  it('EN: sem português nos textos fixos (título, cards, período)', async () => {
    serve()
    renderWithIntl(<Dashboard />, { locale: 'en' })

    expect(await screen.findByText('Active agents')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(body()).not.toMatch(PT_WORDS)
    expect(body()).toContain('1,000')
  })

  it('pt-BR: sem inglês e com milhar pt-BR', async () => {
    serve()
    renderWithIntl(<Dashboard />)

    expect(await screen.findByText('Agentes ativos')).toBeInTheDocument()
    expect(body()).not.toMatch(EN_WORDS)
    expect(body()).toContain('1.000')
  })
})
