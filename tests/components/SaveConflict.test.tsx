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

// P3-06 (D-P3-06-1): o 412 do salvar relê a versão atual pelo BFF e abre o
// diálogo com o que difere. Spec: docs/design/P3-06.md §3 (V-P3-06-10 a 18).
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
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: ['clima'],
  version: 3
}
// A versão que outra pessoa salvou no meio.
const newer = { ...agent, nome: 'Assistente v5', prompt: 'Seja breve.', tools_ids: ['clima', 'busca'], version: 5 }

const noTools = http.get('*/api/tools', () =>
  HttpResponse.json({
    success: true,
    data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
  })
)

const status = (code: number, error = 'x') =>
  HttpResponse.json({ success: false, error }, { status: code })
const conflict412 = () => status(412, 'version_conflict')

type Put = { ifMatch: string | null; body: Record<string, unknown> }
/**
 * O servidor do teste: GET devolve a lista de respostas na ordem (a última se
 * repete), PUT as dele; devolve o que foi visto.
 */
function serve(
  gets: Array<object | Response>,
  puts: Array<Response | (() => Response)>,
  path = 'agents'
) {
  const seen = { gets: 0, puts: [] as Put[] }
  server.use(
    http.get(`*/api/${path}/:id`, () => {
      const next = gets[Math.min(seen.gets++, gets.length - 1)]
      return next instanceof Response ? next : HttpResponse.json({ success: true, data: next })
    }),
    http.put(`*/api/${path}/:id`, async ({ request }) => {
      seen.puts.push({
        ifMatch: request.headers.get('if-match'),
        body: (await request.json()) as Record<string, unknown>
      })
      const next = puts[Math.min(seen.puts.length - 1, puts.length - 1)]
      return typeof next === 'function' ? next() : next.clone()
    })
  )
  return seen
}

function renderAgent() {
  renderWithIntl(
    <>
      <AgentEditor id={agent.id} />
      <Toaster />
    </>
  )
}

const save = () => screen.getByRole('button', { name: 'Salvar' })

async function openConflict(user: ReturnType<typeof userEvent.setup>) {
  const name = await screen.findByLabelText('Nome *')
  await user.clear(name)
  await user.type(name, 'Meu nome')
  await waitFor(() => expect(save()).toBeEnabled())
  await user.click(save())
  return screen.findByRole('dialog', { name: 'O agente mudou' })
}

describe('412 ao salvar (agent)', () => {
  it('abre o diálogo sem toast: "Buscando…" com Voltar focado e as outras saídas desabilitadas', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    // A carga inicial passa; a leitura da versão atual espera o portão.
    let reads = 0
    server.use(
      noTools,
      http.get('*/api/agents/:id', async () => {
        if (reads++ > 0) await gate
        return HttpResponse.json({ success: true, data: reads === 1 ? agent : newer })
      }),
      http.put('*/api/agents/:id', () => conflict412())
    )
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)

    expect(within(dialog).getByRole('status')).toHaveTextContent('Buscando a versão atual para comparar…')
    expect(dialog).toHaveTextContent('Uma versão mais nova foi salva enquanto você editava.')
    expect(within(dialog).getByRole('button', { name: 'Salvar as minhas por cima' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Recarregar a atual' })).toBeDisabled()
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Voltar ao formulário' })).toHaveFocus()
    )
    expect(screen.queryByText(/código 412/)).not.toBeInTheDocument()
    release()
    expect(await within(dialog).findByRole('region', { name: 'Campos que diferem' })).toBeInTheDocument()
  })

  it('lista o que difere (o seu valor × atual) com a versão e a contagem, na ordem do formulário', async () => {
    server.use(noTools)
    serve([agent, newer], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)

    const list = await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    expect(dialog).toHaveTextContent(
      'Uma versão mais nova (v5) foi salva enquanto você editava a v3. 3 campos do formulário diferem da versão atual.'
    )
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getAllByText(/^(Nome|Prompt do sistema|Tools disponíveis)$/)[0].textContent)).toEqual([
      'Nome',
      'Prompt do sistema',
      'Tools disponíveis'
    ])
    expect(within(rows[0]).getByText('O seu valor').nextElementSibling).toHaveTextContent('Meu nome')
    expect(within(rows[0]).getByText('Atual').nextElementSibling).toHaveTextContent('Assistente v5')
    // Conjunto: só o que falta do outro lado e quantos são iguais.
    expect(rows[2]).toHaveTextContent('Só as diferenças; 1 igual nos dois.')
    expect(within(rows[2]).getByText('busca')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Recarregar descarta as suas edições. Salvar por cima substitui')
    const buttons = within(dialog).getAllByRole('button').map((button) => button.textContent)
    expect(buttons).toEqual(
      expect.arrayContaining(['Voltar ao formulário', 'Salvar as minhas por cima', 'Recarregar a atual'])
    )
  })

  it('Voltar ao formulário fecha, devolve o foco ao Salvar e mantém as edições; o próximo Salvar repete o fluxo', async () => {
    server.use(noTools)
    const seen = serve([agent, newer], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    await user.click(within(dialog).getByRole('button', { name: 'Voltar ao formulário' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(save()).toHaveFocus())
    expect(screen.getByLabelText('Nome *')).toHaveValue('Meu nome')
    await user.click(save())
    await screen.findByRole('dialog', { name: 'O agente mudou' })
    expect(seen.puts.map((put) => put.ifMatch)).toEqual(['"3"', '"3"'])
  })

  it('Recarregar a atual descarta as edições, abre o formulário na versão atual, avisa e leva o foco ao h1 (sem novo GET)', async () => {
    server.use(noTools)
    const seen = serve([agent, newer], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    await user.click(within(dialog).getByRole('button', { name: 'Recarregar a atual' }))

    expect(await screen.findByText('Versão atual carregada')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome *')).toHaveValue('Assistente v5')
    expect(screen.getByLabelText('Prompt do sistema')).toHaveValue('Seja breve.')
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Editar agente' })).toHaveFocus()
    )
    expect(seen.gets).toBe(2)
    // A versão passa a ser a atual.
    await user.click(save())
    await waitFor(() => expect(seen.puts).toHaveLength(2))
    expect(seen.puts[1].ifMatch).toBe('"5"')
  })

  it('Salvar as minhas por cima: PUT com o If-Match e o active da versão atual; toast e volta à lista', async () => {
    const push = vi.spyOn(router, 'push')
    server.use(noTools)
    const seen = serve(
      [agent, { ...newer, active: false }],
      [conflict412(), HttpResponse.json({ success: true, data: newer })]
    )
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar as minhas por cima' }))

    expect(await screen.findByText('Agente salvo')).toBeInTheDocument()
    expect(seen.puts).toHaveLength(2)
    expect(seen.puts[1].ifMatch).toBe('"5"')
    expect(seen.puts[1].body).toMatchObject({ nome: 'Meu nome', active: false })
    expect(push).toHaveBeenCalledWith('/agents')
  })

  it('outro 412 durante o salvar por cima: o diálogo fica, relê e avisa "Mudou de novo" com a versão nova', async () => {
    server.use(noTools)
    const seen = serve([agent, newer, { ...newer, version: 6 }], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar as minhas por cima' }))

    expect(await within(dialog).findByText(/Mudou de novo enquanto você decidia/)).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Uma versão mais nova (v6)')
    expect(seen.puts.map((put) => put.ifMatch)).toEqual(['"3"', '"5"'])
    expect(screen.getByRole('dialog', { name: 'O agente mudou' })).toBeInTheDocument()
  })

  it('422 no salvar por cima: o diálogo fecha, o erro cai no campo e a versão do editor passa a ser a atual', async () => {
    server.use(noTools)
    const seen = serve(
      [agent, newer],
      [
        conflict412(),
        HttpResponse.json({ success: false, error: 'invalid_config', field: 'model' }, { status: 422 })
      ]
    )
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar as minhas por cima' }))

    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // O foco fica no campo com erro (não volta ao Salvar).
    await waitFor(() => expect(screen.getByLabelText(/^Modelo \*/)).toHaveFocus())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText(/^Modelo \*/)).toHaveFocus()
    await user.click(save())
    await waitFor(() => expect(seen.puts).toHaveLength(3))
    expect(seen.puts[2].ifMatch).toBe('"5"')
  })

  it('422 no salvar por cima com a atual inativa: Reativar parte do documento e da versão da atual', async () => {
    server.use(noTools)
    const seen = serve(
      [agent, { ...newer, active: false }],
      [
        conflict412(),
        HttpResponse.json({ success: false, error: 'invalid_config', field: 'model' }, { status: 422 }),
        HttpResponse.json({ success: true, data: { ...newer, version: 6 } })
      ]
    )
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar as minhas por cima' }))
    await screen.findByText('Valor recusado pelo orquestrador')
    await user.click(await screen.findByRole('button', { name: 'Reativar agente' }))

    await waitFor(() => expect(seen.puts).toHaveLength(3))
    expect(seen.puts[2].ifMatch).toBe('"5"')
    expect(seen.puts[2].body).toMatchObject({ nome: 'Assistente v5', active: true })
  })

  it('Reativar depois do 422 não leva campo opcional que só a versão lida tinha (api_key_ref, RAG)', async () => {
    const old = {
      ...agent,
      api_key_ref: 'env:OLD_API_KEY',
      rag_config: { active: true, doc_name: 'doc-velho', model: 'embed', factoryIaModel: 'openai' }
    }
    server.use(noTools)
    const seen = serve(
      [old, { ...newer, active: false }],
      [
        conflict412(),
        HttpResponse.json({ success: false, error: 'invalid_config', field: 'model' }, { status: 422 }),
        HttpResponse.json({ success: true, data: { ...newer, version: 6 } })
      ]
    )
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar as minhas por cima' }))
    await screen.findByText('Valor recusado pelo orquestrador')
    await user.click(await screen.findByRole('button', { name: 'Reativar agente' }))

    await waitFor(() => expect(seen.puts).toHaveLength(3))
    const body = seen.puts[2].body
    expect(seen.puts[2].ifMatch).toBe('"5"')
    expect(body.api_key_ref || undefined).toBeUndefined()
    expect(body.rag_active).toBe(false)
    expect(body.rag_doc_name || undefined).toBeUndefined()
    expect(JSON.stringify(body)).not.toMatch(/OLD_API_KEY|doc-velho/)
  })

  it('a versão atual foi excluída (404): "O agente foi excluído", Ir para a lista e nada de salvar por cima', async () => {
    server.use(noTools)
    serve([agent, status(404, 'not_found')], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    await user.type(await screen.findByLabelText('Nome *'), ' x')
    await waitFor(() => expect(save()).toBeEnabled())
    await user.click(save())

    const dialog = await screen.findByRole('dialog', { name: 'O agente foi excluído' })
    expect(dialog).toHaveTextContent('“Assistente” foi excluído enquanto você editava.')
    expect(within(dialog).getByRole('link', { name: 'Ir para a lista' })).toHaveAttribute('href', '/agents')
    expect(within(dialog).queryByRole('button', { name: 'Salvar as minhas por cima' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Voltar ao formulário' })).toBeInTheDocument()
  })

  it('falha ao rereler (503): alerta com o código, só Voltar e Tentar de novo; tentar de novo mostra a comparação', async () => {
    server.use(noTools)
    serve([agent, status(503, 'unreachable'), newer], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    const dialog = await openConflict(user)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Não foi possível buscar a versão atual (código 503). Sem ela não dá para comparar nem salvar por cima.'
    )
    expect(within(dialog).queryByRole('button', { name: 'Salvar as minhas por cima' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Recarregar a atual' })).not.toBeInTheDocument()
    const retry = within(dialog).getByRole('button', { name: 'Tentar de novo' })
    await waitFor(() => expect(retry).toHaveFocus())
    await user.click(retry)

    expect(await within(dialog).findByRole('region', { name: 'Campos que diferem' })).toBeInTheDocument()
  })

  it('só mudou o que o formulário não cobre: sem lista, ajuda e "Salvar por cima" como último botão', async () => {
    server.use(noTools)
    serve([agent, { ...agent, version: 4, futuro: 'x' }], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    await screen.findByLabelText('Nome *')
    await waitFor(() => expect(save()).toBeEnabled())
    await user.click(save())
    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })

    expect(await within(dialog).findByText(/nenhum campo do formulário difere/)).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Salvar por cima grava só o que o formulário cobre')
    expect(within(dialog).queryByRole('region', { name: 'Campos que diferem' })).not.toBeInTheDocument()
    const labels = within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((text) => text !== 'Fechar')
    expect(labels).toEqual(['Voltar ao formulário', 'Recarregar a atual', 'Salvar as minhas por cima'])
  })

  it('texto longo recolhe e o "Mostrar tudo" expande as duas caixas', async () => {
    const long = Array.from({ length: 8 }, (_, line) => `linha ${line}`).join('\n')
    server.use(noTools)
    serve([agent, { ...agent, prompt: long, version: 4 }], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    await screen.findByLabelText('Nome *')
    await waitFor(() => expect(save()).toBeEnabled())
    await user.click(save())
    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })

    const more = await within(dialog).findByRole('button', { name: 'Mostrar tudo' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialog).getAllByText(/linha 0/)[0]).toHaveClass('line-clamp-4')
    await user.click(more)
    expect(within(dialog).getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('texto longo de uma linha', () => {
  it('abaixo do limite aparece inteiro, sem corte e sem botão', async () => {
    const text = 'palavra '.repeat(25).trim()
    server.use(noTools)
    serve([agent, { ...agent, descricao: text, version: 4 }], [conflict412()])
    const user = userEvent.setup()
    renderAgent()

    await screen.findByLabelText('Nome *')
    await waitFor(() => expect(save()).toBeEnabled())
    await user.click(save())
    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })

    expect(await within(dialog).findByText(text)).not.toHaveClass('line-clamp-4')
    expect(within(dialog).queryByRole('button', { name: 'Mostrar tudo' })).not.toBeInTheDocument()
  })
})

describe('412 ao salvar (tool): segredos nunca aparecem', () => {
  const tool = {
    id: 'clima',
    name: 'Clima',
    description: 'Previsão',
    route: 'https://clima.example.com/v1',
    http_method: 'GET',
    parameters: [{ name: 'cidade', type: 'string', description: 'Cidade', required: true }],
    instructions: '',
    headers: { 'X-Api-Key': '***', 'X-Conta': 'env:CLIMA_CONTA', 'X-Texto': 'valor-secreto-antigo' },
    active: true,
    version: 7
  }
  const newerTool = {
    ...tool,
    version: 8,
    headers: { 'X-Api-Key': '***', 'X-Conta': 'file:/run/secrets/conta', 'X-Texto': 'valor-secreto-novo' },
    parameters: [{ ...tool.parameters[0], required: false }]
  }

  it('mostra referência, oculto e texto como "••••••" com a ajuda; parâmetro com tipo e obrigatoriedade', async () => {
    serve([tool, newerTool], [conflict412()], 'tools')
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <ToolEditor id="clima" />
        <Toaster />
      </>
    )

    await user.click(await screen.findByRole('button', { name: 'Salvar' }))
    const dialog = await screen.findByRole('dialog', { name: 'A tool mudou' })
    const list = await within(dialog).findByRole('region', { name: 'Campos que diferem' })

    expect(list).toHaveTextContent('X-Conta')
    expect(list).toHaveTextContent('env:CLIMA_CONTA')
    expect(list).toHaveTextContent('file:/run/secrets/conta')
    expect(within(list).getAllByText('referência')).toHaveLength(2)
    expect(list).toHaveTextContent('Valores em texto não são exibidos.')
    expect(within(list).getAllByText('texto')).toHaveLength(2)
    expect(list).toHaveTextContent('string · obrigatório')
    expect(list).toHaveTextContent('string · opcional')
    expect(document.body.textContent).not.toMatch(/valor-secreto/)
    // O header oculto igual nos dois lados não vira linha.
    expect(within(list).queryByText('X-Api-Key')).not.toBeInTheDocument()
  })
})

describe('412 ao salvar (team)', () => {
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

  it('compara membros e modo; "A mudança" usa o texto de team', async () => {
    server.use(
      http.get('*/api/agents', () =>
        HttpResponse.json({
          success: true,
          data: { data: [agent], total: 1, page: 1, limit: 100, totalPages: 1 }
        })
      )
    )
    serve([team, { ...team, mode: 'tasks', version: 3 }], [conflict412()], 'teams')
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <TeamEditor id="suporte" />
        <Toaster />
      </>
    )

    await waitFor(() => expect(save()).toBeEnabled())
    await user.click(save())
    const dialog = await screen.findByRole('dialog', { name: 'O team mudou' })

    const list = await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    expect(within(list).getByText('Modo de coordenação')).toBeInTheDocument()
    expect(list).toHaveTextContent('route')
    expect(list).toHaveTextContent('tasks')
  })
})
