import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { GET as getAgentRoute, PUT as putAgentRoute } from '@/app/api/agents/[id]/route'
import { GET as getTeamRoute, PUT as putTeamRoute } from '@/app/api/teams/[id]/route'
import { GET as getToolRoute, PUT as putToolRoute } from '@/app/api/tools/[id]/route'
import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { TeamEditor } from '@/components/management/teams/TeamEditor'
import { ToolEditor } from '@/components/management/tools/ToolEditor'

import { TEST_ENV } from '../../e2e/test-env'
import { renderWithIntl } from '../helpers/intl'
import { paste, stubBrowserApis } from '../helpers/toolForm'
import { server } from '../msw/server'

// QA da P4-02: o que os testes do dev não alcançam. O documento vem no formato do
// orquestrador real (`entity_document`, config_documents.py) e passa pelo BFF de
// verdade (route handler + mapeamento), então null, ausente e legado chegam ao
// editor como chegariam em produção.
const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

beforeAll(stubBrowserApis)

type Kind = 'agents' | 'teams' | 'tools'
type Doc = Record<string, unknown> & { id: string; version: number }

const ROUTES = {
  agents: { GET: getAgentRoute, PUT: putAgentRoute, Editor: AgentEditor },
  teams: { GET: getTeamRoute, PUT: putTeamRoute, Editor: TeamEditor },
  tools: { GET: getToolRoute, PUT: putToolRoute, Editor: ToolEditor }
} as const

// AgentConfig, TeamConfig e Tool do orquestrador como a API os mostra: todos os
// campos da dataclass, com null nos opcionais.
const agentDoc = (extra: Record<string, unknown> = {}): Doc => ({
  id: 'a1',
  nome: 'Agente',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  descricao: null,
  prompt: '',
  tools_ids: null,
  rag_config: null,
  user_memory_active: false,
  summary_active: false,
  active: true,
  model_params: null,
  base_url: null,
  api_key_ref: null,
  markdown: true,
  add_history_to_context: true,
  num_history_runs: 5,
  add_datetime_to_context: true,
  reasoning: false,
  version: 4,
  ...extra
})
const teamDoc = (extra: Record<string, unknown> = {}): Doc => ({
  id: 't1',
  nome: 'Time',
  factory_ia_model: 'openai',
  model: 'gpt-4o',
  member_ids: ['a1'],
  mode: 'route',
  descricao: null,
  prompt: null,
  user_memory_active: true,
  summary_active: false,
  active: true,
  model_params: null,
  base_url: null,
  api_key_ref: null,
  markdown: true,
  add_history_to_context: true,
  version: 2,
  ...extra
})
const toolDoc = (extra: Record<string, unknown> = {}): Doc => ({
  id: 'f1',
  name: 'Ferramenta',
  description: 'Faz algo',
  route: 'https://api.example.com/v1',
  http_method: 'GET',
  parameters: [],
  instructions: null,
  headers: null,
  active: true,
  version: 6,
  ...extra
})
const DOCS = { agents: agentDoc, teams: teamDoc, tools: toolDoc } as const

const ORQ = `${TEST_ENV.ORCHESTRATOR_URL}/admin/config`

// O orquestrador: GET devolve o documento; PUT grava como o modo estrito (ausente
// vale o default da entidade) e responde o documento mostrado, com header em
// texto mascarado. O BFF é o real.
function orchestrator(kind: Kind, initial: Doc) {
  let doc = initial
  const puts: Record<string, unknown>[] = []
  const documentOf = DOCS[kind]
  const { GET, PUT } = ROUTES[kind]
  const context = (id: unknown) => ({ params: Promise.resolve({ id: String(id) }) })
  server.use(
    http.get(`${ORQ}/${kind}/:id`, () => HttpResponse.json(doc, { headers: { ETag: `"${doc.version}"` } })),
    http.put(`${ORQ}/${kind}/:id`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      puts.push(body)
      const headers = body.headers as Record<string, string> | undefined
      doc = {
        ...documentOf(),
        ...body,
        id: doc.id,
        version: doc.version + 1,
        ...(headers
          ? {
              headers: Object.fromEntries(
                Object.entries(headers).map(([name, value]) => [name, value.startsWith('env:') ? value : '***'])
              )
            }
          : {})
      }
      return HttpResponse.json(doc, { headers: { ETag: `"${doc.version}"`, 'Runtime-Revision': '9' } })
    }),
    http.get(`*/api/${kind}/:id`, ({ request, params }) => GET(new NextRequest(request.url), context(params.id))),
    http.put(`*/api/${kind}/:id`, async ({ request, params }) =>
      PUT(
        new NextRequest(request.url, {
          method: 'PUT',
          headers: request.headers,
          body: await request.text()
        }),
        context(params.id)
      )
    ),
    http.get('*/api/tools', () =>
      HttpResponse.json({
        success: true,
        data: {
          data: [
            { ...toolDoc(), id: 'clima', name: 'Clima', headers: {}, instructions: '' },
            { ...toolDoc(), id: 'busca', name: 'Busca', headers: {}, instructions: '' }
          ],
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 1
        }
      })
    ),
    http.get('*/api/agents', () =>
      HttpResponse.json({
        success: true,
        data: {
          data: [
            { id: 'a1', nome: 'Agente', active: true },
            { id: 'a2', nome: 'Outro', active: true }
          ],
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 1
        }
      })
    )
  )
  return { puts, current: () => doc }
}

const save = () => screen.getByRole('button', { name: 'Salvar' })
const HINT = 'Nenhuma alteração para salvar.'
const reviewDialog = () => screen.findByRole('dialog', { name: 'Revisar antes de salvar' })
const confirm = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Confirmar e salvar' })
const back = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Voltar ao formulário' })
const nameField = () => screen.getAllByLabelText('Nome *')[0]
const unchanged = () => expect(save()).toHaveAttribute('aria-disabled', 'true')
const changed = () => expect(save()).not.toHaveAttribute('aria-disabled')

async function open(kind: Kind, doc: Doc) {
  const backend = orchestrator(kind, doc)
  const user = userEvent.setup()
  const { Editor } = ROUTES[kind]
  const view = renderWithIntl(<Editor id={doc.id} />)
  // O 1º caso do arquivo carrega a frio: na suíte inteira passa do 1 s padrão do `waitFor`.
  await waitFor(() => expect(save()).toBeEnabled(), { timeout: 10000 })
  return { user, view, ...backend }
}

// O formulário sem tocar, com o que os efeitos e o RHF aplicam já assentado, e uma
// comparação forçada: digitar e apagar um caractere no nome.
async function compareAgain(user: ReturnType<typeof userEvent.setup>) {
  await user.type(nameField(), 'x')
  changed()
  await user.type(nameField(), '{Backspace}')
}

const rowsOf = (dialog: HTMLElement) =>
  within(within(dialog).getByRole('region', { name: 'Campos alterados' })).getAllByRole('listitem')

describe('Contrato real × editor: documento cru aberto sem tocar', () => {
  const RAG_LEGACY = {
    active: false,
    doc_name: null,
    model: 'nomic-embed-text:latest',
    factory_ia_model: 'ollama',
    search_strategy: 'semantic',
    model_params: null,
    base_url: null,
    api_key_ref: null
  }
  const CASES: [string, Kind, Doc][] = [
    ['agent: tudo null', 'agents', agentDoc()],
    ['agent: tools_ids com id que não existe mais', 'agents', agentDoc({ tools_ids: ['sumiu'] })],
    ['agent: rag_config legado (defaults do mapper)', 'agents', agentDoc({ rag_config: RAG_LEGACY })],
    ['agent: rag_config só com active', 'agents', agentDoc({ rag_config: { active: false } })],
    ['agent: rag_config vazio e desligado', 'agents', agentDoc({ rag_config: { active: false, doc_name: '', model: '', factory_ia_model: '' } })],
    ['agent: prompt em lista (seed)', 'agents', agentDoc({ prompt: ['Linha 1', 'Linha 2'] })],
    ['agent: provedor fora do schema', 'agents', agentDoc({ factory_ia_model: 'legado-x' })],
    ['agent: execução fora do default', 'agents', agentDoc({ markdown: false, add_history_to_context: false, num_history_runs: 50, reasoning: true })],
    ['agent: execução ausente (fake mais permissivo que a entidade)', 'agents', agentDoc({ markdown: undefined, add_history_to_context: undefined, num_history_runs: undefined, add_datetime_to_context: undefined, reasoning: undefined })],
    ['agent: model_params com os três tipos e número como texto', 'agents', agentDoc({ model_params: { temperature: 0.5, top_p: 1.0, stop: 'fim', flag: true, n: '5', vazio: '' } })],
    ['agent: base_url e referência', 'agents', agentDoc({ base_url: 'http://x.test', api_key_ref: 'env:OPENAI_API_KEY' })],
    ['team: tudo null', 'teams', teamDoc()],
    ['team: membro e modo fora do que existe', 'teams', teamDoc({ member_ids: ['sumiu', 'a1'], mode: 'legado' })],
    ['team: execução ausente', 'teams', teamDoc({ markdown: undefined, add_history_to_context: undefined, user_memory_active: undefined, summary_active: undefined })],
    ['team: prompt em lista', 'teams', teamDoc({ prompt: ['a', 'b'] })],
    ['tool: instructions e headers null', 'tools', toolDoc()],
    ['tool: método fora do schema', 'tools', toolDoc({ http_method: 'OPTIONS' })],
    [
      'tool: default_value de cada tipo, inclusive divergente do tipo',
      'tools',
      toolDoc({
        parameters: [
          { name: 'a', type: 'string', description: 'd', required: false, default_value: null },
          { name: 'b', type: 'string', description: 'd', required: true, default_value: 5 },
          { name: 'c', type: 'integer', description: 'd', required: false, default_value: 10 },
          { name: 'd', type: 'float', description: 'd', required: false, default_value: 5.5 },
          { name: 'e', type: 'boolean', description: 'd', required: false, default_value: true },
          { name: 'g', type: 'object', description: 'd', required: false, default_value: { b: 1, a: [2] } },
          { name: 'h', type: 'array', description: 'd', required: false, default_value: [1, 'x'] }
        ]
      })
    ],
    [
      'tool: headers mascarado e referência, parâmetro da rota opcional',
      'tools',
      toolDoc({
        route: 'https://api.example.com/{id}',
        parameters: [{ name: 'id', type: 'string', description: 'd', required: false, default_value: null }],
        headers: { 'X-Key': '***', 'X-Ref': 'env:X_API_KEY' }
      })
    ]
  ]

  it.each(CASES)('%s: Salvar sem mudança, mesmo depois de Tab por todo o formulário e de uma comparação', async (_name, kind, doc) => {
    const { user } = await open(kind, doc)

    unchanged()
    expect(screen.getByText(HINT)).toBeInTheDocument()

    for (let step = 0; step < 80; step++) await user.tab()
    await compareAgain(user)

    unchanged()
    expect(screen.getByText(HINT)).toBeInTheDocument()
  }, 30_000)
})

describe('Limitação aceita R15 (roadmap P4-02): boolean com valor padrão inválido gravado', () => {
  it('sem tocar não há linha, e junto de outra edição o PUT tira o valor sem listar a troca', async () => {
    const parameter = { name: 'f', type: 'boolean', description: 'd', required: false, default_value: 'talvez' }
    const { user, puts } = await open('tools', toolDoc({ parameters: [parameter] }))
    unchanged()

    await user.type(nameField(), 'z')
    await user.click(save())
    const dialog = await reviewDialog()
    // A linha não existe: `parseDefault` devolve ok com `undefined` para 'talvez'.
    expect(rowsOf(dialog)).toHaveLength(1)
    await user.click(confirm(dialog))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect((puts[0].parameters as object[])[0]).not.toHaveProperty('default_value')
  })
})

describe('Resposta do 200: a próxima comparação não acusa mudança falsa', () => {
  it.each([
    ['agents', agentDoc()],
    ['teams', teamDoc()],
    ['tools', toolDoc()]
  ] as const)('%s: documento cru salvo volta preenchido pelos defaults: Salvar sem mudança', async (kind, doc) => {
    const { user } = await open(kind, doc)
    await user.type(nameField(), 'z')
    await user.click(save())
    await user.click(confirm(await reviewDialog()))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(unchanged)
    await compareAgain(user)
    unchanged()
  })

  // O BFF apara `nome`/`name`: a comparação apara o mesmo (`trimFields`) e os três
  // editores refazem o formulário com o documento salvo (`form.reset`, D-P4-02-6).
  const trailingSpace = async (kind: Kind, doc: Doc) => {
    const { user, puts } = await open(kind, doc)
    await user.type(nameField(), ' z ')
    await user.click(save())
    await user.click(confirm(await reviewDialog()))
    await waitFor(() => expect(puts).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(unchanged)
  }

  it('tool: espaço no fim do nome (o BFF apara): Salvar sem mudança', () => trailingSpace('tools', toolDoc()))

  it.each([
    ['agents', agentDoc()],
    ['teams', teamDoc()]
  ] as const)('P4-02-B1 corrigido (%s): espaço no fim do nome (o BFF apara): Salvar sem mudança', (kind, doc) =>
    trailingSpace(kind, doc)
  )

  it('P4-02-B2 corrigido: histórico vazio e desligado (o orquestrador devolve o default): Salvar sem mudança', async () => {
    const { user, puts } = await open('agents', agentDoc())
    await user.clear(screen.getByRole('spinbutton'))
    await user.click(screen.getByRole('switch', { name: /histórico/i }))
    await user.click(save())
    await user.click(confirm(await reviewDialog()))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).not.toHaveProperty('num_history_runs')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(unchanged)
  })
})

describe('Prompt com \\r\\n', () => {
  it.each([
    ['agents', agentDoc({ prompt: 'a\r\nb\r\nc' }), 'Prompt do sistema'],
    ['teams', teamDoc({ prompt: 'a\r\nb\r\nc' }), 'Prompt do líder']
  ] as const)('P4-02-B3 corrigido (%s): passar pelo campo sem digitar não vira alteração', async (kind, doc, label) => {
    const { user } = await open(kind, doc)
    const prompt = screen.getByLabelText(label)

    await user.click(prompt)
    await user.tab()
    await compareAgain(user)

    unchanged()
  })
})

async function pick(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, option: string) {
  await user.click(trigger)
  await user.click(screen.getByRole('option', { name: option }))
}

describe('Ida e volta: voltar ao valor lido apaga o Salvar', () => {
  it('agent: número 5 × 5.0 não é mudança; vazio é, e voltar a 5 apaga', async () => {
    const { user } = await open('agents', agentDoc())
    const runs = screen.getByRole('spinbutton')

    await user.clear(runs)
    changed()
    await user.type(runs, '5.0')
    unchanged()
    await user.clear(runs)
    await user.type(runs, '6')
    changed()
    await user.clear(runs)
    await user.type(runs, '5')
    unchanged()
  })

  it('agent: parâmetro do modelo 0.5 × 0.50, removido e readicionado (muda de posição): apaga', async () => {
    const { user } = await open('agents', agentDoc({ model_params: { temperature: 0.5, max_tokens: 10 } }))
    const value = screen.getByRole('textbox', { name: 'Valor de temperature' })

    await user.type(value, '0')
    unchanged()

    await user.click(screen.getByRole('button', { name: 'Remover temperature' }))
    changed()
    await user.click(screen.getAllByRole('button', { name: 'Adicionar parâmetro' })[0])
    await pick(user, screen.getByRole('combobox', { name: 'Nome do parâmetro 2' }), 'temperature')
    await user.type(screen.getByRole('textbox', { name: 'Valor de temperature' }), '0.5')
    unchanged()
  })

  it('agent: select, switch e texto com espaço: apaga', async () => {
    const { user } = await open('agents', agentDoc({ descricao: 'Texto' }))

    await pick(user, screen.getByRole('combobox', { name: /^Provedor \*/ }), 'ollama')
    changed()
    await pick(user, screen.getByRole('combobox', { name: /^Provedor \*/ }), 'openai')
    unchanged()

    const markdown = screen.getByRole('switch', { name: /markdown/i })
    await user.click(markdown)
    changed()
    await user.click(markdown)
    unchanged()

    const description = screen.getByLabelText('Descrição')
    await user.type(description, ' ')
    changed()
    await user.type(description, '{Backspace}')
    unchanged()
  })

  it('agent: ligar o RAG, trocar provedor e desligar sem preencher: apaga', async () => {
    const { user } = await open('agents', agentDoc())
    const rag = screen.getByRole('switch', { name: 'Habilitar RAG' })

    await user.click(rag)
    changed()
    await pick(user, screen.getByRole('combobox', { name: /^Provedor de embedding/ }), 'ollama')
    await user.click(rag)
    unchanged()
  })

  it('agent: referência da chave com o formato trocado e o alvo apagado, de ida e volta: apaga', async () => {
    const { user } = await open('agents', agentDoc({ api_key_ref: 'env:OPENAI_API_KEY' }))
    const target = screen.getByDisplayValue('OPENAI_API_KEY')

    await user.clear(target)
    changed()
    await user.type(target, 'OPENAI_API_KEY')
    unchanged()

    await pick(user, screen.getAllByRole('combobox', { name: 'Formato' })[0], 'file:')
    changed()
    await pick(user, screen.getAllByRole('combobox', { name: 'Formato' })[0], 'env:')
    unchanged()
  })

  it('team: membro e modo: apaga', async () => {
    const { user } = await open('teams', teamDoc())
    const other = await screen.findByRole('checkbox', { name: /Outro/ })

    await user.click(other)
    changed()
    await user.click(other)
    unchanged()

    await user.click(screen.getByRole('radio', { name: /coordinate/i }))
    changed()
    await user.click(screen.getByRole('radio', { name: /route/i }))
    unchanged()
  })

  it('tool: header renomeado e renomeado de volta; mascarado substituído e mantido; referência removida e readicionada: apaga', async () => {
    const { user } = await open('tools', toolDoc({ headers: { 'X-Key': '***', 'X-Ref': 'env:X_API_KEY' } }))

    const headerName = screen.getByRole('textbox', { name: 'Nome do header 1' })
    await user.type(headerName, 'Y')
    changed()
    await user.type(headerName, '{Backspace}')
    unchanged()

    await user.click(screen.getByRole('button', { name: 'Substituir o valor de X-Key' }))
    changed()
    await user.click(screen.getByRole('button', { name: 'Manter o valor oculto de X-Key' }))
    unchanged()

    await user.click(screen.getByRole('button', { name: 'Remover X-Ref' }))
    changed()
    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    await user.type(screen.getByRole('textbox', { name: 'Nome do header 2' }), 'X-Ref')
    changed()
    await paste(user, screen.getByRole('textbox', { name: 'Valor de X-Ref' }), 'env:X_API_KEY')
    await waitFor(unchanged)
  })

  it('tool: parâmetro removido e readicionado, tipo e obrigatório de ida e volta, padrão 5 × 5.0: apaga', async () => {
    const parameter = { name: 'p', type: 'float', description: 'P', required: false, default_value: 5 }
    const { user } = await open('tools', toolDoc({ parameters: [parameter] }))

    const fallback = screen.getByLabelText('Valor padrão')
    await user.type(fallback, '.0')
    unchanged()
    await user.clear(fallback)
    changed()
    await user.type(fallback, '5')
    unchanged()

    const required = screen.getByRole('switch', { name: /obrigatório/i })
    await user.click(required)
    changed()
    await user.click(required)
    unchanged()

    await pick(user, screen.getByRole('combobox', { name: 'Tipo *' }), 'integer')
    changed()
    await pick(user, screen.getByRole('combobox', { name: 'Tipo *' }), 'float')
    unchanged()

    await user.click(screen.getByRole('button', { name: 'Remover p' }))
    changed()
    await user.click(screen.getByRole('button', { name: 'Adicionar parâmetro' }))
    await user.type(screen.getAllByLabelText('Nome *')[1], 'p')
    await user.type(screen.getAllByLabelText(/^Descrição/)[1], 'P')
    await pick(user, screen.getByRole('combobox', { name: 'Tipo *' }), 'float')
    await user.type(screen.getByLabelText('Valor padrão'), '5')
    unchanged()
  })

  it('tool: dois parâmetros trocam de posição pelo nome: nada muda para o modelo, então não há linha', async () => {
    const a = { name: 'a', type: 'string', description: 'A', required: false, default_value: null }
    const b = { name: 'b', type: 'string', description: 'B', required: false, default_value: null }
    const { user } = await open('tools', toolDoc({ parameters: [a, b] }))
    const [nameA, nameB] = screen.getAllByLabelText('Nome *').slice(1)
    const [descriptionA, descriptionB] = screen.getAllByLabelText(/^Descrição/).slice(1)

    await user.clear(nameA)
    await user.type(nameA, 'b')
    await user.clear(descriptionA)
    await user.type(descriptionA, 'B')
    await user.clear(nameB)
    await user.type(nameB, 'a')
    await user.clear(descriptionB)
    await user.type(descriptionB, 'A')

    unchanged()
  })
})

describe('Corridas', () => {
  it('duplo clique no Salvar abre um só diálogo; Confirmar duas vezes dá um só PUT', async () => {
    const { user, puts } = await open('agents', agentDoc())
    await user.type(nameField(), 'z')

    fireEvent.click(save())
    fireEvent.click(save())
    const dialog = await reviewDialog()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.click(confirm(dialog))
    fireEvent.click(within(dialog).getAllByRole('button').find((button) => /Confirmar|Salvando/.test(button.textContent ?? ''))!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)))

    expect(puts).toHaveLength(1)
  })

  it('Enter segurado no Salvar: o 2º Enter cai no Voltar, nunca no Confirmar; nenhum PUT', async () => {
    const { user, puts } = await open('tools', toolDoc())
    await user.type(nameField(), 'z')
    save().focus()

    await user.keyboard('{Enter}')
    const dialog = await reviewDialog()
    await waitFor(() => expect(back(dialog)).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(puts).toEqual([])
    await waitFor(() => expect(save()).toHaveFocus())
  })

  it('duas aberturas seguidas listam as mesmas linhas na mesma ordem, a da tela', async () => {
    const { user } = await open('agents', agentDoc({ model_params: { temperature: 0.1 } }))
    await user.type(nameField(), 'z')
    await user.type(screen.getByLabelText('Descrição'), 'd')
    await user.type(screen.getByLabelText('Prompt do sistema'), 'p')
    await user.type(screen.getByRole('textbox', { name: 'Valor de temperature' }), '5')
    await user.click(await screen.findByRole('checkbox', { name: /Busca/ }))
    await user.click(screen.getByRole('switch', { name: /markdown/i }))

    const labels = async () => {
      await user.click(save())
      const dialog = await reviewDialog()
      const rows = rowsOf(dialog).map((row) => row.querySelector('p')?.textContent)
      await user.click(back(dialog))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      return rows
    }
    const first = await labels()

    expect(first).toEqual(['Nome', 'Descrição', expect.stringContaining('temperature'), 'Prompt do sistema', expect.stringMatching(/markdown/i), 'Tools disponíveis'])
    expect(await labels()).toEqual(first)
  })

  it('o editor troca de entidade com o diálogo aberto: o diálogo some e nada é enviado', async () => {
    const { user, puts, view } = await open('agents', agentDoc())
    await user.type(nameField(), 'z')
    await user.click(save())
    await reviewDialog()

    server.use(
      http.get('*/api/agents/outro', () =>
        HttpResponse.json({ success: true, data: { id: 'outro', nome: 'Outro', model: 'm', factoryIaModel: 'openai', descricao: '', prompt: '', active: true, tools_ids: [], version: 1 } })
      )
    )
    view.rerender(<AgentEditor id="outro" />)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(nameField()).toHaveValue('Outro'))
    unchanged()
    expect(puts).toEqual([])
  })

  it('desmontar com o PUT em andamento não derruba nada nem deixa diálogo', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { user, view } = await open('agents', agentDoc())
    server.use(
      http.put('*/api/agents/:id', async () => {
        await gate
        return HttpResponse.json({ success: true, data: { id: 'a1', version: 5 } })
      })
    )
    const consoleError = vi.spyOn(console, 'error')
    await user.type(nameField(), 'z')
    await user.click(save())
    await user.click(confirm(await reviewDialog()))
    await within(await reviewDialog()).findByRole('button', { name: 'Salvando…' })

    view.unmount()
    release()
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('412, Recarregar e nova edição: a revisão compara com a versão recarregada e o PUT leva o If-Match dela', async () => {
    const stale = agentDoc({ nome: 'Antigo' })
    const { user } = await open('agents', stale)
    const newer = { ...agentDoc({ nome: 'Da outra pessoa' }), version: 9 }
    const ifMatch: (string | null)[] = []
    let conflict = true
    server.use(
      http.put('*/api/agents/:id', async ({ request }) => {
        ifMatch.push(request.headers.get('if-match'))
        if (conflict) {
          conflict = false
          return HttpResponse.json({ success: false, error: 'version_conflict' }, { status: 412 })
        }
        return HttpResponse.json({ success: true, data: { ...newer, factoryIaModel: 'openai', tools_ids: [], descricao: '', nome: 'Editado depois', version: 10 } })
      }),
      http.get('*/api/agents/:id', () =>
        HttpResponse.json({ success: true, data: { ...newer, factoryIaModel: 'openai', tools_ids: [], descricao: '' } })
      )
    )
    await user.type(nameField(), 'z')
    await user.click(save())
    await user.click(confirm(await reviewDialog()))
    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })
    await user.click(await within(dialog).findByRole('button', { name: /Recarregar/ }))

    await waitFor(() => expect(nameField()).toHaveValue('Da outra pessoa'))
    unchanged()
    await user.clear(nameField())
    await user.type(nameField(), 'Editado depois')
    await user.click(save())
    const review = await reviewDialog()
    expect(review).toHaveAccessibleDescription(/em relação à v9,/)
    expect(rowsOf(review)).toHaveLength(1)
    expect(within(review).getByText('Antes').nextElementSibling).toHaveTextContent('Da outra pessoa')
    await user.click(confirm(review))

    await waitFor(() => expect(ifMatch).toEqual(['"4"', '"9"']))
    await waitFor(unchanged)
  })
})

describe('Segredo no diálogo e no conflito', () => {
  const noSecret = (root: HTMLElement, ...secrets: string[]) => {
    for (const secret of secrets) expect(root.innerHTML).not.toContain(secret)
  }

  it('rag_api_key_ref legado trocado: mascarado nos dois lados', async () => {
    const legacy = 'sk-rag-legado-99999'
    const { user } = await open('agents', agentDoc({
      rag_config: { active: true, doc_name: 'd', model: 'e', factory_ia_model: 'openai', search_strategy: 'semantic', api_key_ref: legacy }
    }))
    await paste(user, screen.getByDisplayValue(legacy), 'env:OTHER_API_KEY')

    await user.click(save())
    const dialog = await reviewDialog()

    noSecret(dialog, legacy)
    expect(dialog).toHaveTextContent('••••••')
  })

  it.each([
    ['nome com cara de segredo', 'X-Secret-Value'],
    ['nome comum', 'X-Conta'],
    ['prefixo em outra caixa', 'X-Caixa'],
    ['prefixo desconhecido', 'X-Vault']
  ])('header novo em texto, %s: o valor nunca aparece', async (_case, header) => {
    const value = header === 'X-Caixa' ? 'ENV:sk-caixa-123' : header === 'X-Vault' ? 'vault:sk-123-abc' : 'sk-digitado-12345'
    const { user } = await open('tools', toolDoc())
    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    await user.type(screen.getByRole('textbox', { name: 'Nome do header 1' }), header)
    await paste(user, screen.getByRole('textbox', { name: `Valor de ${header}` }), value)

    await user.click(save())
    const dialog = await reviewDialog()

    noSecret(dialog, value)
    expect(dialog).toHaveTextContent(header)
    expect(dialog).toHaveTextContent('••••••')
  })

  it.each(['env:minha-senha-123', 'file:senha-sem-barra'])('header com referência fora da regra (%s): o diálogo não abre', async (value) => {
    const { user } = await open('tools', toolDoc())
    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    await user.type(screen.getByRole('textbox', { name: 'Nome do header 1' }), 'X-Conta')
    const input = screen.getByRole('textbox', { name: 'Valor de X-Conta' })
    await paste(user, input, value)

    await user.click(save())
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('tool com 412: header digitado segue mascarado no conflito, e o valor não aparece em nenhuma linha', async () => {
    const typed = 'sk-digitado-conflito-1'
    const { user } = await open('tools', toolDoc({ headers: { 'X-Conta': 'env:X_API_KEY' } }))
    const newer = { ...toolDoc({ name: 'Outra', headers: { 'X-Conta': '***' }, instructions: '' }), version: 9 }
    server.use(
      http.put('*/api/tools/:id', () => HttpResponse.json({ success: false, error: 'version_conflict' }, { status: 412 })),
      http.get('*/api/tools/:id', () => HttpResponse.json({ success: true, data: newer }))
    )
    await user.click(screen.getByRole('button', { name: 'Remover X-Conta' }))
    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    await user.type(screen.getByRole('textbox', { name: 'Nome do header 1' }), 'X-Conta')
    await paste(user, screen.getByRole('textbox', { name: 'Valor de X-Conta' }), typed)

    await user.click(save())
    const review = await reviewDialog()
    noSecret(review, typed)
    await user.click(confirm(review))

    const dialog = await screen.findByRole('dialog', { name: 'A tool mudou' })
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    noSecret(dialog, typed)
    expect(dialog).toHaveTextContent('••••••')
  })
})

describe('Tool: valor padrão que o parse esconde', () => {
  it('BUG P4-02-B5: padrão inválido gravado e apagado pelo usuário: o documento muda, o Salvar devia acender', async () => {
    const parameter = { name: 'p', type: 'integer', description: 'P', required: false, default_value: 'dez' }
    const { user } = await open('tools', toolDoc({ parameters: [parameter] }))

    await user.clear(screen.getByLabelText('Valor padrão'))

    changed()
  })
})

describe('EN (V-19): nomes e valores do diálogo', () => {
  const PT = ['Antes', 'Depois', 'Ligado', 'Desligado', 'vazio', 'ausente', 'obrigatório', 'opcional', 'padrão', 'texto', 'oculto', 'Só as diferenças', 'Valores em texto', 'Mostrar', 'Voltar', 'alteraç', 'Provedor', 'Nome']

  it('tool: parâmetro, header oculto, texto e ausente em EN, sem resto de pt-BR', async () => {
    orchestrator('tools', toolDoc({
      headers: { 'X-Old': '***', 'X-Ref': 'env:X_API_KEY' },
      parameters: [{ name: 'p', type: 'integer', description: 'P', required: true, default_value: 1 }]
    }))
    const user = userEvent.setup()
    renderWithIntl(<ToolEditor id="f1" />, { locale: 'en' })
    const saveEn = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveEn).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Remove X-Old' }))
    await user.click(screen.getByRole('button', { name: 'Add header' }))
    await user.type(screen.getByRole('textbox', { name: 'Header 2 name' }), 'X-New')
    await paste(user, screen.getByRole('textbox', { name: 'Value of X-New' }), 'plain')
    await user.clear(screen.getByLabelText('Default value'))
    await user.click(saveEn)

    const dialog = await screen.findByRole('dialog', { name: 'Review before saving' })
    const text = dialog.textContent ?? ''
    for (const word of PT) expect(text).not.toContain(word)
    expect(text).toMatch(/integer · required/)
    expect(text).toContain('absent')
    expect(text).toContain('Text values are not shown.')
  })

  it('agent: booleano, vazio, conjunto e rótulos em EN', async () => {
    orchestrator('agents', agentDoc({ tools_ids: ['clima'] }))
    const user = userEvent.setup()
    renderWithIntl(<AgentEditor id="a1" />, { locale: 'en' })
    const saveEn = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveEn).toBeEnabled())

    await user.click(await screen.findByRole('checkbox', { name: /Busca/ }))
    await user.type(screen.getByLabelText('Description'), 'x')
    await user.click(screen.getAllByRole('switch')[0])
    await user.click(saveEn)

    const dialog = await screen.findByRole('dialog', { name: 'Review before saving' })
    const text = dialog.textContent ?? ''
    for (const word of PT) expect(text).not.toContain(word)
    expect(text).toContain('empty')
    expect(text).toContain('Off')
  })
})

// Reteste: o que as correções de B1 a B5 trouxeram (`form.reset` em agent e team,
// `trimFields` em `toPayload`, default inválido como texto na carga).
describe('Depois do 200: o formulário refeito segue funcionando', () => {
  const saveFlow = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(save())
    await user.click(confirm(await reviewDialog()))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  }
  const RAG = { active: true, doc_name: 'base', model: 'e', factory_ia_model: 'openai', search_strategy: 'semantic' }

  it('agent: lista de parâmetros, RAG e tools refeitos; 2º salvar leva o que mudou, com a versão nova', async () => {
    const { user, puts, current } = await open('agents', agentDoc({
      model_params: { temperature: 0.5 },
      rag_config: RAG,
      tools_ids: ['clima']
    }))
    await user.type(nameField(), 'z')
    await saveFlow(user)
    await screen.findByText(/^Agente salvo\./)
    await waitFor(unchanged)

    await user.type(screen.getByRole('textbox', { name: 'Valor de temperature' }), '5')
    await user.type(screen.getByRole('textbox', { name: 'Nome do documento *' }), '2')
    await user.click(await screen.findByRole('checkbox', { name: /Busca/ }))
    expect(screen.queryByText(/^Agente salvo\./)).not.toBeInTheDocument()
    await user.click(save())
    const dialog = await reviewDialog()
    expect(dialog).toHaveAccessibleDescription(/3 alterações em relação à v5,/)
    await user.click(confirm(dialog))

    await waitFor(() => expect(puts).toHaveLength(2))
    expect(puts[1]).toMatchObject({ model_params: { temperature: 0.55 }, tools_ids: ['clima', 'busca'] })
    expect(puts[1].rag_config).toMatchObject({ doc_name: 'base2' })
    await waitFor(unchanged)
    expect(current().version).toBe(6)
  })

  it('team: membro, modo e parâmetro refeitos; 2º salvar leva o que mudou', async () => {
    const { user, puts } = await open('teams', teamDoc({ model_params: { temperature: 0.5 } }))
    await user.type(nameField(), 'z')
    await saveFlow(user)
    await screen.findByText(/^Team salvo\./)
    await waitFor(unchanged)

    await user.click(await screen.findByRole('checkbox', { name: /Outro/ }))
    await user.click(screen.getByRole('radio', { name: /coordinate/i }))
    await user.type(screen.getByRole('textbox', { name: 'Valor de temperature' }), '5')
    await saveFlow(user)

    await waitFor(() => expect(puts).toHaveLength(2))
    expect(puts[1]).toMatchObject({ member_ids: ['a1', 'a2'], mode: 'coordinate', model_params: { temperature: 0.55 } })
    await waitFor(unchanged)
  })

  it('tool: header em texto vira oculto; 2º salvar mantém o oculto e leva o parâmetro editado', async () => {
    const parameter = { name: 'p', type: 'string', description: 'P', required: false, default_value: null }
    const { user, puts } = await open('tools', toolDoc({ parameters: [parameter] }))
    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    await user.type(screen.getByRole('textbox', { name: 'Nome do header 1' }), 'X-Conta')
    await paste(user, screen.getByRole('textbox', { name: 'Valor de X-Conta' }), 'segredo-digitado')
    await saveFlow(user)
    await screen.findByText(/^Tool salva\./)
    await waitFor(unchanged)

    await user.type(screen.getAllByLabelText(/^Descrição/)[1], '2')
    await saveFlow(user)

    await waitFor(() => expect(puts).toHaveLength(2))
    expect(puts[1]).toMatchObject({ headers: { 'X-Conta': '***' }, parameters: [expect.objectContaining({ description: 'P2' })] })
    await waitFor(unchanged)
  })

  it('agent: descartar o RAG e salvar: o status fica, mesmo com o efeito do embedder rodando de novo', async () => {
    const { user, puts } = await open('agents', agentDoc({ rag_config: { ...RAG, active: false } }))
    await user.click(screen.getByRole('button', { name: 'Descartar valores' }))
    changed()
    await saveFlow(user)

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0].rag_config).toBeNull()
    expect(await screen.findByText(/^Agente salvo\./)).toBeInTheDocument()
    await waitFor(unchanged)
    expect(screen.getByText(/^Agente salvo\./)).toBeInTheDocument()
  })

  it('B2: o campo de histórico vazio volta a mostrar o valor salvo, editável depois de religar', async () => {
    const { user } = await open('agents', agentDoc())
    const runs = screen.getByRole('spinbutton')
    await user.clear(runs)
    const history = screen.getByRole('switch', { name: /histórico/i })
    await user.click(history)
    await saveFlow(user)
    await waitFor(unchanged)

    expect(screen.getByRole('spinbutton')).toHaveValue(5)
    await user.click(screen.getByRole('switch', { name: /histórico/i }))
    changed()
    await user.clear(screen.getByRole('spinbutton'))
    await user.type(screen.getByRole('spinbutton'), '7')
    await saveFlow(user)
    await waitFor(unchanged)
    expect(screen.getByRole('spinbutton')).toHaveValue(7)
  })

  it('agent: 412 e "Salvar por cima" com espaço no nome: o formulário refeito é o documento gravado', async () => {
    const newer = { ...agentDoc({ nome: 'Outra pessoa' }), version: 9 }
    const { user } = await open('agents', agentDoc())
    const ifMatch: (string | null)[] = []
    server.use(
      http.get(`${ORQ}/agents/:id`, () => HttpResponse.json(newer)),
      http.put(`${ORQ}/agents/:id`, async ({ request }) => {
        const match = request.headers.get('if-match')
        ifMatch.push(match)
        if (match !== '"9"') return HttpResponse.json({ detail: 'Versão divergente' }, { status: 412 })
        const body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...agentDoc(), ...body, id: 'a1', version: 10 }, { headers: { 'Runtime-Revision': '9' } })
      })
    )
    await paste(user, nameField(), 'Meu nome ')
    await user.click(save())
    await user.click(confirm(await reviewDialog()))
    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })

    await user.click(await within(dialog).findByRole('button', { name: 'Salvar as minhas por cima' }))

    expect(await screen.findByText(/^Agente salvo\./)).toBeInTheDocument()
    expect(ifMatch).toEqual(['"4"', '"9"'])
    await waitFor(unchanged)
    expect(nameField()).toHaveValue('Meu nome')
  })

  const refuse = (kind: Kind, body: object, status: number) =>
    server.use(http.put(`*/api/${kind}/:id`, () => HttpResponse.json(body, { status })))

  it.each(['agents', 'teams', 'tools'] as const)('%s: 422 de campo no 2º salvar: erro e foco no campo, com o formulário refeito', async (kind) => {
    const { user } = await open(kind, DOCS[kind]())
    await user.type(nameField(), 'z')
    await saveFlow(user)
    await waitFor(unchanged)

    refuse(kind, { success: false, error: 'invalid_config', field: kind === 'tools' ? 'name' : 'nome' }, 422)
    await user.type(nameField(), 'y')
    await saveFlow(user)

    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeInTheDocument()
    await waitFor(() => expect(nameField()).toHaveFocus())
    changed()
  })

  it('agent: 422 em model_params no 2º salvar: foco no 1º valor da lista refeita', async () => {
    const { user } = await open('agents', agentDoc({ model_params: { temperature: 0.5 } }))
    await user.type(nameField(), 'z')
    await saveFlow(user)
    await waitFor(unchanged)

    refuse('agents', { success: false, error: 'invalid_config', field: 'model_params' }, 422)
    const value = screen.getByRole('textbox', { name: 'Valor de temperature' })
    await user.type(value, '5')
    await saveFlow(user)

    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Valor de temperature' })).toHaveFocus())
  })

  it.each([
    ['agents', 'not_applied', 422, /^Não aplicada/, /^Agente salvo\./],
    ['teams', 'not_confirmed', 502, /^Não confirmada/, /^Team salvo\./]
  ] as const)('%s: %s, nova edição apaga o bloco e o salvar seguinte grava com a mesma versão lida', async (kind, error, status, title, saved) => {
    const doc = DOCS[kind]()
    const { user, puts } = await open(kind, doc)
    const ifMatch: (string | null)[] = []
    server.use(
      http.put(`*/api/${kind}/:id`, ({ request }) => {
        ifMatch.push(request.headers.get('if-match'))
        return HttpResponse.json({ success: false, error }, { status })
      })
    )
    await user.type(nameField(), 'z')
    await saveFlow(user)
    expect(await screen.findByText(title)).toBeInTheDocument()
    changed()
    expect(nameField()).toHaveValue(`${doc.nome}z`)

    await user.type(nameField(), 'y')
    expect(screen.queryByText(title)).not.toBeInTheDocument()

    server.resetHandlers()
    const again = orchestrator(kind, doc)
    await user.click(save())
    const dialog = await reviewDialog()
    expect(dialog).toHaveAccessibleDescription(new RegExp(`em relação à v${doc.version},`))
    await user.click(confirm(dialog))

    expect(await screen.findByText(saved)).toBeInTheDocument()
    expect(again.puts).toHaveLength(1)
    expect(puts).toHaveLength(0)
    expect(ifMatch).toEqual([`"${doc.version}"`])
    await waitFor(unchanged)
  })
})

describe('Tool com valor padrão inválido gravado: Reativar e Excluir', () => {
  const invalid = (default_value: unknown) => ({ name: 'p', type: 'integer', description: 'P', required: false, default_value })

  it('Reativar sem editar devolve o documento como veio: "dez" segue "dez"', async () => {
    const { user, puts } = await open('tools', toolDoc({ active: false, parameters: [invalid('dez')] }))

    await user.click(screen.getByRole('button', { name: 'Reativar tool' }))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ active: true, parameters: [expect.objectContaining({ default_value: 'dez' })] })
    expect(await screen.findByText('Ativa')).toBeInTheDocument()
    expect(screen.getByLabelText('Valor padrão')).toHaveValue('dez')
  })

  it.fails('BUG P4-02-B6: Reativar não devia trocar o tipo do valor gravado: 5.5 num integer segue número', async () => {
    const { user, puts } = await open('tools', toolDoc({ active: false, parameters: [invalid(5.5)] }))

    await user.click(screen.getByRole('button', { name: 'Reativar tool' }))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0].parameters).toEqual([expect.objectContaining({ default_value: 5.5 })])
  })

  it('Excluir: o DELETE sai com a versão lida, sem passar pela validação do valor padrão', async () => {
    const { user } = await open('tools', toolDoc({ parameters: [invalid('dez')] }))
    const deletes: string[] = []
    server.use(
      http.delete('*/api/tools/:id', ({ request }) => {
        deletes.push(request.headers.get('if-match') ?? '')
        return HttpResponse.json({ success: true, data: { deleted: true } })
      })
    )

    await user.click(screen.getByRole('button', { name: 'Excluir tool' }))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir tool' })
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(deletes).toEqual(['"6"']))
  })
})

describe('trimFields: só espaços e espaço interno', () => {
  const blank = async (kind: Kind, field: () => HTMLElement, message: string) => {
    const { user, puts } = await open(kind, DOCS[kind]())
    await paste(user, field(), '   ')
    await user.click(save())
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
    await waitFor(() => expect(field()).toHaveFocus())
    expect(puts).toEqual([])
  }

  it.fails.each(['agents', 'teams', 'tools'] as const)('BUG P4-02-B7 (%s): nome só com espaços devia dar erro no campo, sem diálogo nem PUT', (kind) =>
    blank(kind, nameField, 'Nome é obrigatório')
  )

  it.fails('BUG P4-02-B7: modelo só com espaços devia dar erro no campo', () =>
    blank('agents', () => screen.getByLabelText(/^Modelo \*/), 'Modelo é obrigatório')
  )

  it('tool: descrição só com espaços: erro no campo', () =>
    blank('tools', () => screen.getAllByLabelText(/^Descrição/)[0], 'Descrição é obrigatória')
  )

  it.each(['agents', 'teams', 'tools'] as const)('%s: espaço interno fica, nas pontas sai: lista, PUT e campo depois do 200', async (kind) => {
    const { user, puts } = await open(kind, DOCS[kind]())
    const field = kind === 'tools' ? 'name' : 'nome'
    await paste(user, nameField(), '  Novo  Nome  ')

    await user.click(save())
    const dialog = await reviewDialog()
    expect(within(dialog).getByText('Depois').nextElementSibling?.textContent).toBe('Novo  Nome')
    await user.click(confirm(dialog))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0][field]).toBe('Novo  Nome')
    await waitFor(unchanged)
    expect(nameField()).toHaveValue('Novo  Nome')
  })
})

describe('P4-02-B4 corrigido, na tela', () => {
  it('tool: header digitado como constructor: a tela segue viva e o diálogo mostra "Antes" ausente', async () => {
    const { user } = await open('tools', toolDoc())
    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    await user.type(screen.getByRole('textbox', { name: 'Nome do header 1' }), 'constructor')
    await paste(user, screen.getByRole('textbox', { name: 'Valor de constructor' }), 'valor-digitado')

    await user.click(save())
    const dialog = await reviewDialog()

    expect(rowsOf(dialog)).toHaveLength(1)
    expect(within(dialog).getByText('Antes').nextElementSibling).toHaveTextContent('ausente')
    expect(dialog.innerHTML).not.toContain('valor-digitado')
  })
})

describe('Campo de uma linha com quebra gravada', () => {
  it.fails('BUG P4-02-B8: descrição de parâmetro em duas linhas: passar pelo campo não devia virar alteração', async () => {
    const parameter = { name: 'p', type: 'string', description: 'linha 1\nlinha 2', required: false, default_value: null }
    const { user } = await open('tools', toolDoc({ parameters: [parameter] }))
    unchanged()

    await user.click(screen.getAllByLabelText(/^Descrição/)[1])
    await user.tab()
    await compareAgain(user)

    unchanged()
  })
})
