import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { teamBodySchema } from '@/app/api/teams/schema'
import { TeamForm } from '@/components/management/teams/TeamForm'
import type { TeamConfig } from '@/types/management'

import { entityControls } from '../helpers/controls'
import { renderWithIntl } from '../helpers/intl'
import { SCHEMA_URL, schemaFixture } from '../msw/handlers'
import { server } from '../msw/server'

// P3-04: editor de team com o documento inteiro (D-P3-04-1). Spec:
// docs/design/P3-04.md (V-P3-04-n). Seção de modelo e de execução reusadas do
// agent (testes próprios em AgentForm.*).

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

const agent = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  descricao: `Descrição de ${nome}`,
  prompt: '',
  active: true,
  tools_ids: [],
  factoryIaModel: 'openai',
  model: 'gpt-4o',
  version: 1,
  ...extra
})

const AGENTS = [
  agent('suporte-local', 'Suporte local', { descricao: 'Atende dúvidas básicas' }),
  agent('pesquisador', 'Pesquisador', { descricao: 'Busca na web' }),
  agent('arquivado', 'Arquivado', { active: false })
]

const serveAgents = (list: object[] = AGENTS, total = list.length) =>
  server.use(
    http.get('*/api/agents', () =>
      HttpResponse.json({
        success: true,
        data: { data: list, total, page: 1, limit: 100, totalPages: 1 }
      })
    )
  )

const team: TeamConfig = {
  id: 'suporte',
  nome: 'Suporte',
  descricao: 'Time de suporte',
  prompt: 'Escolha o melhor membro.',
  active: true,
  member_ids: ['suporte-local'],
  mode: 'route',
  factoryIaModel: 'ollama',
  model: 'llama3.2',
  version: 3
}

const serveSchema = (data: object) =>
  server.use(
    http.get(SCHEMA_URL, () =>
      HttpResponse.json({ success: true, data: { ...schemaFixture, ...data } })
    )
  )

type Sent = { method: string; url: string; ifMatch: string | null; body: Record<string, unknown> }
function serveSave(respond?: () => Response) {
  const sent: Sent[] = []
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      sent.push({
        method,
        url: new URL(request.url).pathname,
        ifMatch: request.headers.get('if-match'),
        body: (await request.json()) as Record<string, unknown>
      })
      return respond ? respond() : HttpResponse.json({ success: true, data: {} })
    }
  server.use(http.post('*/api/teams', handle('POST')), http.put('*/api/teams/:id', handle('PUT')))
  return sent
}

const rejectWith = (field: string) => () =>
  HttpResponse.json({ success: false, error: 'invalid_config', field }, { status: 422 })

async function ready(element = <TeamForm team={team} onSuccess={() => {}} />) {
  const user = userEvent.setup()
  renderWithIntl(
    <>
      {element}
      <Toaster />
    </>
  )
  await waitFor(() => expect(provider()).toBeEnabled())
  await screen.findByRole('checkbox', { name: /Suporte local/ })
  return user
}

const provider = () => screen.getByRole('combobox', { name: /^Provedor \*/ })
const save = () => screen.getByRole('button', { name: 'Salvar' })
const members = () => screen.getByRole('group', { name: 'Agents do team' })
const member = (name: RegExp | string) => within(members()).getByRole('checkbox', { name })
const mode = (name: string) => screen.getByRole('radio', { name })
const execution = () => screen.getByRole('region', { name: 'Execução' })

describe('TeamForm: seções', () => {
  it('V-4: Identidade, Membros, Modo, Modelo do líder, Instruções e Execução, sem RAG nem Tools', async () => {
    serveAgents()
    await ready()

    const regions = screen
      .getAllByRole('region')
      .flatMap((region) => region.getAttribute('aria-labelledby') ?? [])
    expect(regions.map((id) => document.getElementById(id ?? '')?.textContent)).toEqual([
      'Identidade',
      'Membros',
      'Modo de coordenação',
      'Modelo do líder',
      'Instruções',
      'Execução'
    ])
    expect(screen.getByRole('textbox', { name: 'Prompt do líder' })).toHaveValue('Escolha o melhor membro.')
    expect(screen.getByLabelText(/^ID do team/)).toBeDisabled()
  })

  it('team novo: ID editável, sem "Excluir team"; modo route padrão e execução com os padrões do team', async () => {
    serveAgents()
    await ready(<TeamForm onSuccess={() => {}} />)

    expect(screen.getByLabelText(/^ID do team/)).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Excluir team' })).not.toBeInTheDocument()
    expect(mode('route')).toBeChecked()
    expect(within(mode('route').closest('div') as HTMLElement).getByText('Padrão')).toBeInTheDocument()
    // V-14: 4 switches; markdown, histórico e memória ligados; resumo desligado.
    const switches = within(execution()).getAllByRole('switch')
    expect(switches.map((item) => item.id)).toEqual([
      'markdown',
      'add_history_to_context',
      'user_memory_active',
      'summary_active'
    ])
    expect(switches.map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'true', 'true', 'false'])
    expect(within(execution()).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(within(execution()).queryByText('Raciocínio passo a passo')).not.toBeInTheDocument()
    expect(within(execution()).getByText('Memória do usuário').closest('li')).toHaveTextContent('Padrão: ligado')
  })

  it('V-13: o modelo do líder tem os campos do agent, com os textos do team', async () => {
    serveAgents()
    await ready()

    const model = screen.getByRole('region', { name: 'Modelo do líder' })
    expect(within(model).getByRole('combobox', { name: /^Provedor \*/ })).toHaveTextContent('ollama')
    expect(within(model).getByRole('textbox', { name: /^Modelo \*/ })).toHaveValue('llama3.2')
    expect(within(model).getByText(/o team não define chave própria/)).toBeInTheDocument()
    expect(within(model).queryByText(/o agente/)).not.toBeInTheDocument()
    expect(within(model).getByRole('button', { name: 'Adicionar parâmetro' })).toBeInTheDocument()
  })
})

describe('TeamForm: membros', () => {
  it('V-5: lista todos os agents como linhas marcáveis; os do team vêm marcados; a contagem acompanha', async () => {
    serveAgents()
    const user = await ready()

    expect(member(/Suporte local/)).toBeChecked()
    expect(member(/Pesquisador/)).not.toBeChecked()
    expect(within(members()).getByText('Inativo')).toBeInTheDocument()
    expect(screen.getByText('1 de 3 selecionados')).toBeInTheDocument()
    expect(member(/Pesquisador/)).toHaveAccessibleDescription('Busca na web')

    await user.click(member(/Pesquisador/))

    expect(member(/Pesquisador/)).toBeChecked()
    expect(screen.getByText('2 de 3 selecionados')).toBeInTheDocument()
  })

  it('V-6: a busca filtra por nome, id e descrição sem desmarcar; sem resultado, "Limpar busca"', async () => {
    serveAgents()
    const user = await ready()
    const search = screen.getByRole('searchbox', { name: 'Buscar agent por nome, id ou descrição' })

    await user.type(search, 'web')
    expect(within(members()).getAllByRole('checkbox')).toHaveLength(1)
    expect(member(/Pesquisador/)).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'suporte-local')
    expect(member(/Suporte local/)).toBeChecked()

    await user.clear(search)
    await user.type(search, 'zzz')
    expect(screen.getByText('Nenhum agent para “zzz”')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }))
    expect(within(members()).getAllByRole('checkbox')).toHaveLength(3)
    expect(member(/Suporte local/)).toBeChecked()
  })

  it('V-7: sem membro, "Escolha ao menos um membro", foco no 1º checkbox e nenhuma requisição', async () => {
    serveAgents()
    const sent = serveSave()
    const user = await ready(<TeamForm team={{ ...team, member_ids: ['suporte-local'] }} onSuccess={() => {}} />)

    await user.click(member(/Suporte local/))
    await user.click(save())

    expect(await screen.findByText('Escolha ao menos um membro')).toBeInTheDocument()
    expect(within(members()).getAllByRole('checkbox')[0]).toHaveFocus()
    expect(within(members()).getAllByRole('checkbox')[0]).toHaveAttribute('aria-invalid', 'true')
    expect(sent).toEqual([])
  })

  it('a ordem gravada dos membros se mantém e os novos vão para o fim, na ordem em que foram marcados', async () => {
    serveAgents()
    const sent = serveSave()
    const user = await ready(
      <TeamForm team={{ ...team, member_ids: ['pesquisador', 'suporte-local'] }} onSuccess={() => {}} />
    )

    await user.click(member(/Arquivado/))
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.member_ids).toEqual(['pesquisador', 'suporte-local', 'arquivado'])
  })

  it('V-8: id gravado que não existe mais aparece no topo, marcado, com aviso; desmarcar o remove', async () => {
    serveAgents()
    const sent = serveSave()
    const user = await ready(
      <TeamForm team={{ ...team, member_ids: ['sumiu', 'suporte-local'] }} onSuccess={() => {}} />
    )

    const missing = within(members()).getAllByRole('checkbox')[0]
    expect(missing).toHaveAccessibleName(/sumiu/)
    expect(missing).toBeChecked()
    expect(screen.getByText(/Este agent não existe mais/)).toBeInTheDocument()

    await user.click(missing)
    expect(within(members()).queryByText(/sumiu/)).not.toBeInTheDocument()
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.member_ids).toEqual(['suporte-local'])
  })

  it('lista com mais agents que o teto: o id fora da página não é dado como inexistente', async () => {
    serveAgents(AGENTS, 112)
    await ready(<TeamForm team={{ ...team, member_ids: ['fora', 'suporte-local'] }} onSuccess={() => {}} />)

    expect(screen.getByText('Fora da lista carregada (mostrando 3 de 112 agents).')).toBeInTheDocument()
    expect(screen.queryByText(/Este agent não existe mais/)).not.toBeInTheDocument()
  })

  it('V-9: sem agents cadastrados, "Criar agent" abre em nova aba e salvar cai no membro obrigatório', async () => {
    serveAgents([])
    const sent = serveSave()
    const user = userEvent.setup()
    renderWithIntl(<TeamForm onSuccess={() => {}} />)

    expect(await screen.findByText('Nenhum agent cadastrado')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Criar agent/ })
    expect(link).toHaveAttribute('href', '/agents/new')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByText('0 de 0 selecionados')).toBeInTheDocument()

    await waitFor(() => expect(provider()).toBeEnabled())
    await user.type(screen.getByLabelText(/^ID do team/), 'novo')
    await user.type(screen.getByLabelText(/^Nome/), 'Novo')
    await user.type(screen.getByRole('textbox', { name: /^Modelo \*/ }), 'm')
    await user.click(save())

    expect(await screen.findByText('Escolha ao menos um membro')).toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it('V-9: carregando agents mostra o status e Salvar desabilitado; falha mostra "Tentar de novo" e só habilita com a lista', async () => {
    const gates: (() => void)[] = []
    let calls = 0
    server.use(
      http.get('*/api/agents', async () => {
        calls += 1
        const failing = calls === 1
        await new Promise<void>((resolve) => gates.push(resolve))
        return failing
          ? HttpResponse.json({ success: false }, { status: 503 })
          : HttpResponse.json({
              success: true,
              data: { data: AGENTS, total: 3, page: 1, limit: 100, totalPages: 1 }
            })
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<TeamForm team={team} onSuccess={() => {}} />)

    expect(await screen.findByText('Carregando agents…')).toBeInTheDocument()
    expect(save()).toBeDisabled()
    gates[0]()
    const alert = await screen.findByText('Não foi possível carregar os agents')
    expect(alert.closest('[role="alert"]')).toHaveTextContent('Salvar fica desabilitado até a lista carregar')
    expect(save()).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Carregando agents…')).toBeInTheDocument()
    await waitFor(() => expect(gates).toHaveLength(2))
    gates[1]()
    await screen.findByRole('checkbox', { name: /Suporte local/ })
    await waitFor(() => expect(save()).toBeEnabled())
  })

  it('só leitura: checkboxes e rádios desabilitados; a busca continua utilizável', async () => {
    serveAgents()
    serveSchema({ writable: false })
    renderWithIntl(<TeamForm team={team} onSuccess={() => {}} />)

    await screen.findByRole('checkbox', { name: /Suporte local/ })
    await screen.findByText(/modo somente leitura/)
    for (const checkbox of within(members()).getAllByRole('checkbox')) expect(checkbox).toBeDisabled()
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(within(execution()).getAllByRole('switch').every((item) => item.hasAttribute('disabled'))).toBe(true)
    expect(screen.getByRole('searchbox', { name: /Buscar agent/ })).toBeEnabled()
  })
})

describe('TeamForm: modo de coordenação', () => {
  it('V-10: um cartão por modo do schema, com a descrição; as setas movem a seleção', async () => {
    serveAgents()
    const user = await ready()

    const radios = screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))
    expect(radios).toEqual(['route', 'coordinate', 'broadcast', 'tasks'])
    expect(mode('route')).toHaveAccessibleDescription('Escolhe um membro e repassa a pergunta. A resposta é a dele.')
    expect(mode('tasks')).toHaveAccessibleDescription(
      'Divide o pedido em tarefas, atribui aos membros e repete até concluir.'
    )

    mode('route').focus()
    await user.keyboard('{ArrowDown}')
    expect(mode('coordinate')).toBeChecked()
    expect(mode('route')).not.toBeChecked()
  })

  it('V-11: modo gravado fora do schema vira um cartão extra, marcado e com aviso; trocar o remove', async () => {
    serveAgents()
    const user = await ready(<TeamForm team={{ ...team, mode: 'legado' }} onSuccess={() => {}} />)

    expect(mode('legado')).toBeChecked()
    expect(screen.getByText(/legado não está entre os modos do orquestrador/)).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(5)

    await user.click(mode('broadcast'))

    expect(screen.queryByRole('radio', { name: 'legado' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('modo fora do schema mantido vai no corpo (o orquestrador decide)', async () => {
    serveAgents()
    const sent = serveSave()
    const user = await ready(<TeamForm team={{ ...team, mode: 'legado' }} onSuccess={() => {}} />)

    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.mode).toBe('legado')
  })

  it('V-15: schema com falha, modo e execução indisponíveis e Salvar desabilitado', async () => {
    serveAgents()
    server.use(http.get(SCHEMA_URL, () => HttpResponse.json({ success: false }, { status: 503 })))
    renderWithIntl(<TeamForm team={team} onSuccess={() => {}} />)

    expect(await screen.findByText('As opções de modo vêm do orquestrador. Use “Tentar de novo” no aviso acima.')).toBeInTheDocument()
    expect(screen.getByText(/As opções de execução vêm do orquestrador/)).toBeInTheDocument()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(save()).toBeDisabled()
  })

  it('V-15: sem o schema, o seletor da referência fica desabilitado e diz de onde vêm os formatos', async () => {
    serveAgents()
    server.use(http.get(SCHEMA_URL, () => HttpResponse.json({ success: false }, { status: 503 })))
    renderWithIntl(<TeamForm team={team} onSuccess={() => {}} />)

    await screen.findByText('As opções de modo vêm do orquestrador. Use “Tentar de novo” no aviso acima.')
    const reference = screen.getByRole('group', { name: 'Referência da chave de API' })
    expect(reference).toHaveTextContent('Os formatos vêm do orquestrador.')
    expect(reference).toHaveTextContent('Vazio: o team não define chave própria.')
    expect(within(reference).getByRole('combobox', { name: 'Formato' })).toBeDisabled()
  })

  it('V-15: schema carregando mostra o status e Salvar desabilitado', async () => {
    serveAgents()
    server.use(http.get(SCHEMA_URL, () => new Promise(() => {})))
    renderWithIntl(<TeamForm team={team} onSuccess={() => {}} />)

    expect((await screen.findAllByText('Carregando opções do orquestrador…')).length).toBeGreaterThan(0)
    expect(save()).toBeDisabled()
  })
})

describe('TeamForm: defaults do schema do team', () => {
  // Os fixtures de agent e team têm os mesmos defaults: aqui o schema do team
  // difere (sem `route`, markdown e histórico desligados) para provar que o
  // form lê `schema.team`, não `schema.agent`.
  const teamSchema = { team: { modes: ['coordinate', 'tasks'], markdown: false, addHistoryToContext: false } }

  it('team novo: 1º modo do schema marcado, switches com o padrão do team e corpo do POST com eles', async () => {
    serveAgents()
    serveSchema(teamSchema)
    const sent = serveSave()
    const user = await ready(<TeamForm onSuccess={() => {}} />)

    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(['coordinate', 'tasks'])
    expect(mode('coordinate')).toBeChecked()
    const markdown = within(execution()).getByRole('switch', { name: 'Responder em Markdown' })
    const history = within(execution()).getByRole('switch', { name: 'Enviar histórico da sessão' })
    expect(markdown).toHaveAttribute('aria-checked', 'false')
    expect(history).toHaveAttribute('aria-checked', 'false')
    expect(markdown.closest('li')).toHaveTextContent('Padrão: desligado')
    expect(history.closest('li')).toHaveTextContent('Padrão: desligado')

    await user.type(screen.getByLabelText(/^ID do team/), 'novo')
    await user.type(screen.getByLabelText(/^Nome/), 'Novo')
    await user.type(screen.getByRole('textbox', { name: /^Modelo \*/ }), 'm')
    await user.click(member(/Pesquisador/))
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body).toMatchObject({
      mode: 'coordinate',
      markdown: false,
      add_history_to_context: false
    })
  })

  it('team gravado sem markdown e histórico usa o padrão do schema do team; modo gravado fora das opções é preservado', async () => {
    serveAgents()
    serveSchema(teamSchema)
    await ready()

    expect(mode('route')).toBeChecked()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(within(execution()).getByRole('switch', { name: 'Responder em Markdown' })).toHaveAttribute('aria-checked', 'false')
  })
})

describe('TeamForm: salvar', () => {
  it('cria com o documento inteiro (sem campos de agent), aceito pelo schema do BFF', async () => {
    serveAgents()
    const sent = serveSave()
    const onSuccess = vi.fn()
    const user = await ready(<TeamForm onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText(/^ID do team/), 'novo-team')
    await user.type(screen.getByLabelText(/^Nome/), 'Novo team')
    await user.type(screen.getByRole('textbox', { name: /^Modelo \*/ }), 'llama3.2')
    await user.click(member(/Pesquisador/))
    await user.click(member(/Suporte local/))
    await user.click(mode('coordinate'))
    await user.click(within(execution()).getByRole('switch', { name: 'Resumo da sessão' }))
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ method: 'POST', url: '/api/teams', ifMatch: null })
    expect(sent[0].body).toEqual({
      id: 'novo-team',
      nome: 'Novo team',
      descricao: '',
      prompt: '',
      active: true,
      member_ids: ['pesquisador', 'suporte-local'],
      mode: 'coordinate',
      factoryIaModel: 'ollama',
      model: 'llama3.2',
      model_params: {},
      base_url: '',
      api_key_ref: '',
      markdown: true,
      add_history_to_context: true,
      user_memory_active: true,
      summary_active: true
    })
    expect(teamBodySchema.safeParse(sent[0].body).success).toBe(true)
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(await screen.findByText('Team salvo')).toBeInTheDocument()
  })

  it('edita: PUT no id codificado com a versão lida no If-Match', async () => {
    serveAgents()
    const sent = serveSave()
    const user = await ready(<TeamForm team={{ ...team, id: 'time a/b' }} onSuccess={() => {}} />)

    await user.clear(screen.getByLabelText(/^Nome/))
    await user.type(screen.getByLabelText(/^Nome/), 'Renomeado')
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ method: 'PUT', url: '/api/teams/time%20a%2Fb', ifMatch: '"3"' })
    expect(sent[0].body).toMatchObject({ nome: 'Renomeado', member_ids: ['suporte-local'] })
  })

  it('V-1: o modelo do líder usa o mesmo seletor de segredo, com o "Vazio" do team', async () => {
    serveAgents()
    await ready()

    const model = screen.getByRole('region', { name: 'Modelo do líder' })
    const group = within(model).getByRole('group', { name: 'Referência da chave de API' })
    expect(within(group).getByRole('combobox', { name: 'Formato' })).toHaveTextContent('env:')
    expect(within(group).getByRole('textbox', { name: 'Variável de ambiente' })).toBeVisible()
    expect(group).toHaveTextContent('Vazio: o team não define chave própria.')
  })

  it('referência da chave fora da regra é recusada no browser, sem requisição nem eco', async () => {
    serveAgents()
    const sent = serveSave()
    const user = await ready()

    await user.type(screen.getByRole('textbox', { name: 'Variável de ambiente' }), 'sk-colado-no-campo')
    await user.click(save())

    const error = await screen.findByText(/^Use MAIÚSCULAS, dígitos e _/)
    expect(error).not.toHaveTextContent('sk-colado-no-campo')
    expect(sent).toEqual([])
  })

  it('id que já existe (409) na criação: toast do team e o form fica', async () => {
    serveAgents()
    serveSave(() => HttpResponse.json({ success: false, error: 'conflict' }, { status: 409 }))
    const user = await ready(<TeamForm onSuccess={() => {}} />)

    await user.type(screen.getByLabelText(/^ID do team/), 'dup')
    await user.type(screen.getByLabelText(/^Nome/), 'Dup')
    await user.type(screen.getByRole('textbox', { name: /^Modelo \*/ }), 'm')
    await user.click(member(/Pesquisador/))
    await user.click(save())

    expect(await screen.findByText('Já existe um team com este ID')).toBeInTheDocument()
  })
})

describe('TeamForm: recusa do orquestrador (422)', () => {
  it('V-12: member_ids aparece abaixo da lista e o foco vai ao 1º membro marcado', async () => {
    serveAgents()
    serveSave(rejectWith('member_ids'))
    const user = await ready(
      <TeamForm team={{ ...team, member_ids: ['arquivado', 'pesquisador'] }} onSuccess={() => {}} />
    )

    await user.click(save())

    const error = await screen.findByText('Valor recusado pelo orquestrador')
    expect(members().parentElement).toContainElement(error)
    expect(member(/Pesquisador/)).toHaveFocus()
    expect(member(/Pesquisador/)).toHaveAccessibleDescription(/Valor recusado pelo orquestrador/)
  })

  it('V-12: mode aparece abaixo dos cartões e o foco vai ao cartão marcado', async () => {
    serveAgents()
    serveSave(rejectWith('mode'))
    const user = await ready()

    await user.click(save())

    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeInTheDocument()
    await waitFor(() => expect(mode('route')).toHaveFocus())
  })

  it.each([
    ['model', () => screen.getByRole('textbox', { name: /^Modelo \*/ })],
    ['base_url', () => screen.getByLabelText('URL base')]
  ])('V-12: %s recusado aparece no campo do modelo, com foco', async (field, input) => {
    serveAgents()
    serveSave(rejectWith(field))
    const user = await ready(<TeamForm team={{ ...team, base_url: 'http://llm.local/v1' }} onSuccess={() => {}} />)

    await user.click(save())

    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeInTheDocument()
    await waitFor(() => expect(input()).toHaveFocus())
  })
})

describe('TeamForm: excluir', () => {
  it('V-16: o Dialog diz que os agents membros não são excluídos; confirmar faz o DELETE com a versão', async () => {
    serveAgents()
    const deleted: string[] = []
    server.use(
      http.delete('*/api/teams/:id', ({ request }) => {
        deleted.push(new URL(request.url).pathname, request.headers.get('if-match') ?? '')
        return HttpResponse.json({ success: true })
      })
    )
    const onSuccess = vi.fn()
    const user = await ready(
      <TeamForm team={team} controls={entityControls()} onSuccess={onSuccess} />
    )

    await user.click(screen.getByRole('button', { name: 'Excluir team' }))
    const dialog = screen.getByRole('dialog', { name: 'Excluir team' })
    expect(dialog).toHaveTextContent(
      'Tem certeza que deseja excluir o team “Suporte”? Esta ação não pode ser desfeita. Os agents membros não são excluídos.'
    )
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText('Team excluído')).toBeInTheDocument()
    expect(deleted).toEqual(['/api/teams/suporte', '"3"'])
    expect(onSuccess).toHaveBeenCalled()
  })
})

