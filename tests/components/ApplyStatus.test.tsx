import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { TeamEditor } from '@/components/management/teams/TeamEditor'
import { ToolEditor } from '@/components/management/tools/ToolEditor'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { RUNTIME_URL } from '../msw/handlers'
import { server } from '../msw/server'

// P4-01 (spec docs/design/P4-01.md §2-3, D-P4-01-4): salvar uma edição deixa
// o editor na tela, com o formulário no documento salvo e o status de
// aplicação acima dos botões (aplicada com N, não aplicada, não confirmada),
// sem toast; o status some na próxima edição. Criar volta à lista com a
// revisão no toast. A casca recebe a revisão da resposta, sem nova leitura.

const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

beforeAll(stubBrowserApis)

const agent = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: [],
  version: 3
}
const team = {
  id: 'suporte',
  nome: 'Suporte',
  descricao: '',
  prompt: '',
  active: true,
  member_ids: ['assistente'],
  mode: 'route',
  factoryIaModel: 'ollama',
  model: 'llama3.2',
  version: 3
}
const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão',
  route: 'https://clima.example.com/v1',
  http_method: 'GET',
  parameters: [],
  instructions: '',
  headers: {},
  active: true,
  version: 3
}

const KINDS = {
  agents: { Editor: AgentEditor, entity: agent, nameKey: 'nome', saved: 'Agente salvo', reload: 'Recarregar agente', title: 'Editar agente' },
  teams: { Editor: TeamEditor, entity: team, nameKey: 'nome', saved: 'Team salvo', reload: 'Recarregar team', title: 'Editar team' },
  tools: { Editor: ToolEditor, entity: tool, nameKey: 'name', saved: 'Tool salva', reload: 'Recarregar tool', title: 'Editar tool' }
} as const
type Kind = keyof typeof KINDS
const KIND_NAMES = Object.keys(KINDS) as Kind[]

const emptyPage = { success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } }
const members = {
  success: true,
  data: { data: [{ ...agent, version: 1 }], total: 1, page: 1, limit: 100, totalPages: 1 }
}

type Respond = () => Response | Promise<Response>

/**
 * O BFF do editor: GET da entidade (a lista na ordem, a última se repete),
 * PUT/POST pela lista de respostas, e a leitura da revisão da casca (7).
 * Devolve o que foi visto.
 */
function serve(kind: Kind, writes: Respond[], gets: object[] = [KINDS[kind].entity]) {
  const seen = { gets: 0, runtime: 0, ifMatch: [] as (string | null)[] }
  const answer = async (request: Request) => {
    seen.ifMatch.push(request.headers.get('if-match'))
    return writes[Math.min(seen.ifMatch.length - 1, writes.length - 1)]()
  }
  server.use(
    http.get(RUNTIME_URL, () => {
      seen.runtime++
      return HttpResponse.json({ success: true, data: { revision: 7 } })
    }),
    http.get('*/api/tools', () => HttpResponse.json(emptyPage)),
    http.get('*/api/agents', () => HttpResponse.json(members)),
    http.get(`*/api/${kind}/:id`, () =>
      HttpResponse.json({ success: true, data: gets[Math.min(seen.gets++, gets.length - 1)] })
    ),
    http.put(`*/api/${kind}/:id`, ({ request }) => answer(request)),
    http.post(`*/api/${kind}`, ({ request }) => answer(request))
  )
  return seen
}

const savedAs = (kind: Kind, patch: object, extra: object = {}) => () =>
  HttpResponse.json({ success: true, data: { ...KINDS[kind].entity, ...patch }, ...extra })
const notApplied = (errorType?: string) => () =>
  HttpResponse.json(
    { success: false, error: 'not_applied', ...(errorType ? { errorType } : {}) },
    { status: 422 }
  )
const notConfirmed = () => HttpResponse.json({ success: false, error: 'not_confirmed' }, { status: 502 })

async function renderEditor(kind: Kind, options: { id?: string; locale?: 'pt-BR' | 'en' } = {}) {
  const { Editor, entity } = KINDS[kind]
  const user = userEvent.setup()
  renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <Editor id={'id' in options ? options.id : entity.id} />
      <Toaster />
    </RuntimeRevisionProvider>,
    { locale: options.locale }
  )
  await screen.findByText(options.locale === 'en' ? 'Runtime revision: 7' : 'Revisão do runtime: 7')
  const save = await screen.findByRole('button', { name: options.locale === 'en' ? 'Save' : 'Salvar' })
  await waitFor(() => expect(save).toBeEnabled())
  return { user, save }
}

const nameField = () => screen.getByLabelText(/^Nome/)
const region = () => document.querySelector<HTMLElement>('[aria-live="polite"][aria-atomic="true"]')!

describe.each(KIND_NAMES)('%s: salvar uma edição', (kind) => {
  const { saved, reload, title, nameKey } = KINDS[kind]

  it('aplicada com N: fica no editor, sem toast, foco no Salvar; a casca troca sem nova leitura; o próximo envio leva a versão nova', async () => {
    const push = vi.spyOn(router, 'push')
    const seen = serve(kind, [savedAs(kind, { [nameKey]: 'Novo nome', version: 4 }, { runtimeRevision: 8 })])
    const { user, save } = await renderEditor(kind)

    await user.clear(nameField())
    await user.type(nameField(), 'Novo nome')
    await user.click(save)

    expect(await within(region()).findByText(`${saved}.`)).toHaveClass('font-medium')
    expect(region()).toHaveTextContent(`${saved}. Mudança aplicada na revisão 8 do runtime.`)
    expect(within(region()).getByText('8')).toHaveClass('font-mono')
    expect(save).toHaveFocus()
    expect(screen.getByText('Revisão do runtime: 8')).toBeInTheDocument()
    expect(seen.runtime).toBe(1)
    expect(screen.queryByText(saved)).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(nameField()).toHaveValue('Novo nome')
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()

    await user.click(save)
    await waitFor(() => expect(seen.ifMatch).toEqual(['"3"', '"4"']))
  })

  it('aplicada sem N: "Mudança aplicada no runtime." e a casca não muda', async () => {
    serve(kind, [savedAs(kind, { version: 4 })])
    const { user, save } = await renderEditor(kind)

    await user.click(save)

    await waitFor(() => expect(region()).toHaveTextContent(`${saved}. Mudança aplicada no runtime.`))
    expect(screen.getByText('Revisão do runtime: 7')).toBeInTheDocument()
  })

  it('não aplicada: título, corpo e o detalhe técnico; o formulário guarda as edições e a casca não muda', async () => {
    serve(kind, [notApplied('pydantic_core.ValidationError')])
    const { user, save } = await renderEditor(kind)

    await user.clear(nameField())
    await user.type(nameField(), 'Editado')
    await user.click(save)

    expect(
      await within(region()).findByText('Não aplicada: o orquestrador não conseguiu carregar esta configuração.')
    ).toHaveClass('text-destructive')
    expect(region()).toHaveTextContent(
      'Nada foi salvo e a versão anterior segue no ar. Revise o que mudou e salve de novo.'
    )
    expect(within(region()).getByText('pydantic_core.ValidationError').tagName).toBe('CODE')
    expect(region()).toHaveTextContent('Detalhe técnico')
    expect(nameField()).toHaveValue('Editado')
    expect(save).toHaveFocus()
    expect(screen.getByText('Revisão do runtime: 7')).toBeInTheDocument()
    expect(screen.queryByText(/código 422/)).not.toBeInTheDocument()
  })

  it('não aplicada sem errorType: sem a linha do detalhe técnico', async () => {
    serve(kind, [notApplied()])
    const { user, save } = await renderEditor(kind)

    await user.click(save)

    await within(region()).findByText(/^Não aplicada/)
    expect(region()).not.toHaveTextContent('Detalhe técnico')
  })

  it('não confirmada: sem toast; "Recarregar" (com o aviso de descarte) relê e mostra o gravado, sem o status e com foco no h1', async () => {
    const seen = serve(kind, [notConfirmed], [KINDS[kind].entity, { ...KINDS[kind].entity, [nameKey]: 'Gravado', version: 4 }])
    const { user, save } = await renderEditor(kind)

    await user.clear(nameField())
    await user.type(nameField(), 'Editado')
    await user.click(save)

    expect(
      await within(region()).findByText('Não confirmada: o orquestrador falhou depois de receber a mudança.')
    ).toHaveClass('text-warning')
    expect(region()).toHaveTextContent('A configuração pode ter sido salva sem entrar no ar.')
    expect(region()).toHaveTextContent('Recarregar descarta as edições não salvas do formulário.')
    expect(screen.queryByText(/Não foi possível salvar/)).not.toBeInTheDocument()

    await user.click(within(region()).getByRole('button', { name: reload }))

    expect(await screen.findByRole('heading', { level: 1, name: title })).toHaveFocus()
    expect(nameField()).toHaveValue('Gravado')
    expect(region()).toBeEmptyDOMElement()
    expect(seen.gets).toBe(2)
  })

  it('o status some na primeira edição', async () => {
    serve(kind, [savedAs(kind, { version: 4 }, { runtimeRevision: 8 })])
    const { user, save } = await renderEditor(kind)

    await user.click(save)
    await within(region()).findByText(`${saved}.`)
    await user.type(nameField(), 'x')

    expect(region()).toBeEmptyDOMElement()
  })

  it('o status some no início de um novo Salvar, sem editar (região vazia durante "Salvando…")', async () => {
    // Portão fora do handler: o 2º PUT fica preso até o release().
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    serve(kind, [
      savedAs(kind, { version: 4 }, { runtimeRevision: 8 }),
      async () => {
        await held
        return savedAs(kind, { version: 5 }, { runtimeRevision: 9 })()
      }
    ])
    const { user, save } = await renderEditor(kind)

    await user.click(save)
    await waitFor(() => expect(region()).toHaveTextContent('revisão 8'))

    await user.click(save)
    expect(await screen.findByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(region()).toBeEmptyDOMElement()

    release()
    await waitFor(() => expect(region()).toHaveTextContent('revisão 9'))
  })
})

describe.each(KIND_NAMES)('%s: criar', (kind) => {
  const { saved } = KINDS[kind]
  const list = `/${kind}`

  it('aplicada: volta à lista com o toast e a revisão na descrição', async () => {
    const push = vi.spyOn(router, 'push')
    serve(kind, [savedAs(kind, { version: 1 }, { runtimeRevision: 5 })])
    // A criação parte do formulário vazio: o POST é exercitado pelo envio do
    // formulário preenchido nos testes de cada form; aqui só a resposta conta.
    const { user, save } = await renderEditor(kind, { id: undefined })
    await fillRequired(kind, user)

    await user.click(save)

    expect(await screen.findByText(saved)).toBeInTheDocument()
    expect(screen.getByText('Mudança aplicada na revisão 5 do runtime.')).toBeInTheDocument()
    expect(push).toHaveBeenCalledWith(list)
    expect(screen.getByText('Revisão do runtime: 5')).toBeInTheDocument()
  })

  it('não confirmada: fica em /new com "Conferir na lista" em nova aba, sem "Recarregar"', async () => {
    const push = vi.spyOn(router, 'push')
    serve(kind, [notConfirmed])
    const { user, save } = await renderEditor(kind, { id: undefined })
    await fillRequired(kind, user)

    await user.click(save)

    await within(region()).findByText(/^Não confirmada/)
    expect(region()).toHaveTextContent(/pode ter sido criad[oa] sem entrar no ar\. Confira na lista antes de salvar de novo\./)
    const link = within(region()).getByRole('link', { name: 'Conferir na lista (abre em nova aba)' })
    expect(link).toHaveAttribute('href', list)
    expect(link).toHaveAttribute('target', '_blank')
    expect(within(region()).queryByRole('button', { name: /Recarregar/ })).not.toBeInTheDocument()
    expect(nameField()).toHaveValue('Nova')
    expect(push).not.toHaveBeenCalled()
  })
})

// Campos obrigatórios do formulário novo de cada tipo.
async function fillRequired(kind: Kind, user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^ID d/), 'nova')
  await user.type(nameField(), 'Nova')
  if (kind === 'agents') await user.type(screen.getByLabelText(/^Modelo \*/), 'gpt-4o')
  if (kind === 'teams') {
    await user.type(screen.getByLabelText(/^Modelo \*/), 'gpt-4o')
    await user.click(await screen.findByRole('checkbox', { name: /Assistente/ }))
  }
  if (kind === 'tools') {
    await user.type(screen.getByLabelText(/^Descrição/), 'Nova tool')
    await user.click(screen.getByLabelText(/^Rota/))
    await user.paste('https://api.example.com/x')
  }
}

describe('casos de um tipo só', () => {
  it('agent: marcar uma tool (fora do formulário) também tira o status', async () => {
    serve('agents', [savedAs('agents', { version: 4 })])
    server.use(
      http.get('*/api/tools', () =>
        HttpResponse.json({
          success: true,
          data: { data: [{ id: 'clima', name: 'Clima', description: 'd' }], total: 1, page: 1, limit: 100, totalPages: 1 }
        })
      )
    )
    const { user, save } = await renderEditor('agents')

    await user.click(save)
    await within(region()).findByText('Agente salvo.')
    await user.click(screen.getByRole('checkbox', { name: /Clima/ }))

    expect(region()).toBeEmptyDOMElement()
  })

  it('tool: o formulário vira o documento salvo (header em texto volta oculto) e o status fica', async () => {
    serve('tools', [
      savedAs('tools', { headers: { 'X-Conta': '***' }, version: 4 }, { runtimeRevision: 8 })
    ])
    const { user, save } = await renderEditor('tools')

    await user.click(screen.getByRole('button', { name: 'Adicionar header' }))
    await user.type(screen.getByLabelText('Nome do header 1'), 'X-Conta')
    await user.click(screen.getByLabelText('Valor de X-Conta'))
    await user.paste('conta-digitada')
    await user.click(save)

    await within(region()).findByText('Tool salva.')
    expect(await screen.findByLabelText('Valor de X-Conta (gravado, oculto)')).toHaveValue('***')
    await delay(20)
    expect(region()).toHaveTextContent('Mudança aplicada na revisão 8 do runtime.')
    expect(screen.queryByDisplayValue('conta-digitada')).not.toBeInTheDocument()
  })

  it('EN: a cópia do status vem do catálogo EN', async () => {
    serve('agents', [notApplied('ValueError')])
    const { user, save } = await renderEditor('agents', { locale: 'en' })

    await user.click(save)

    expect(
      await within(region()).findByText("Not applied: the orchestrator couldn't load this configuration.")
    ).toBeInTheDocument()
    expect(region()).toHaveTextContent('Technical detail')
  })

  it('a região viva fica montada e vazia antes de salvar', async () => {
    serve('agents', [])
    await renderEditor('agents')

    expect(region()).toBeEmptyDOMElement()
  })
})
