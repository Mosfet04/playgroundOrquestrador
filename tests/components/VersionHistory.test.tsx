import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { diffAgent } from '@/components/management/agents/agentDiff'
import { TeamEditor } from '@/components/management/teams/TeamEditor'
import { ToolEditor } from '@/components/management/tools/ToolEditor'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { RUNTIME_URL, runtimeBody } from '../msw/handlers'
import { server } from '../msw/server'
import { saveAndConfirm } from '../helpers/saveReview'

// P4-04 (spec docs/design/P4-04.md, decisões 0034): botão Histórico no
// cabeçalho da edição, Sheet com as versões carregadas só ao abrir (20 por
// página), diff de cada versão e restaurar com confirmação, If-Match da versão
// lida e o desfecho no editor (status da P4-01, conflito da P3-06 em modo
// restaurar, toasts, 422 no diálogo).

const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
// Conta as comparações (o formulário e as versões do histórico passam por ela).
vi.mock('@/components/management/agents/agentDiff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/management/agents/agentDiff')>()
  return { ...actual, diffAgent: vi.fn(actual.diffAgent) }
})

beforeAll(stubBrowserApis)

const AT = '2026-11-14T17:32:00+00:00'

const agent = {
  id: 'pedidos',
  nome: 'Pedidos',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: [],
  model_params: { temperature: 0.2 },
  version: 8
}
type Agent = typeof agent & Record<string, unknown>

const at = (version: number, patch: Partial<Agent> = {}) => ({ ...agent, ...patch, version })
const entry = (version: number, document: object | null, previous: object | null, extra: object = {}) => ({
  version,
  actor: 'admin',
  at: AT,
  document,
  previous,
  ...extra
})

// Mais nova primeiro: a atual (temperatura), o modelo e o prompt, quatro campos
// e o estado, a remoção e a criação.
const v8 = entry(8, agent, at(8, { model_params: { temperature: 0.7 } }))
const v7 = entry(7, at(7, { model_params: { temperature: 0.7 } }), at(7, { model: 'gpt-4o-mini', prompt: 'Antes.', model_params: { temperature: 0.7 } }), {
  actor: 'local-dev'
})
const v5 = entry(5, at(5, { nome: 'Antigo', model: 'gpt-4o-mini', descricao: 'Velha', prompt: 'Curto.', active: false }), at(5))
const removed = entry(3, null, null)
const created = entry(1, at(1, { nome: 'Pedidos v1' }), null)
const HISTORY = [v8, v7, v5, removed, created]

type Respond = (request: Request) => Response | Promise<Response>
const page = (items: object[], total = items.length, offset = 0) =>
  HttpResponse.json({ success: true, data: { items, total, offset, limit: 20 } })

/** O BFF do editor de agent com o histórico; devolve o que foi visto. */
function serve({
  history = () => page(HISTORY),
  restore = () => HttpResponse.json({ success: true, data: at(9, v5.document as object), runtimeRevision: 12 }),
  gets = [agent as object]
}: { history?: Respond; restore?: Respond; gets?: object[] } = {}) {
  const seen = { gets: 0, history: [] as string[], restores: [] as { path: string; ifMatch: string | null }[] }
  server.use(
    http.get(RUNTIME_URL, () => HttpResponse.json(runtimeBody(7))),
    http.get('*/api/tools', () =>
      HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })
    ),
    http.get('*/api/agents/:id', () =>
      HttpResponse.json({ success: true, data: gets[Math.min(seen.gets++, gets.length - 1)] })
    ),
    http.get('*/api/agents/:id/history', ({ request }) => {
      const url = new URL(request.url)
      seen.history.push(`${url.pathname}${url.search}`)
      return history(request)
    }),
    http.post('*/api/agents/:id/history/:version/restore', ({ request }) => {
      seen.restores.push({ path: new URL(request.url).pathname, ifMatch: request.headers.get('if-match') })
      return restore(request)
    })
  )
  return seen
}

async function renderAgent(id: string | undefined = agent.id) {
  // `renderAgent(undefined)` também cairia no padrão: a criação é `renderNew`.
  const user = userEvent.setup()
  const view = renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <AgentEditor id={id || undefined} />
      <Toaster />
    </RuntimeRevisionProvider>
  )
  await screen.findByRole('heading', { level: 1 })
  return { user, view }
}

const renderNew = () => renderAgent('')
// Badge da versão lida ao lado do título (D-P4-04-7).
const versionBadge = () =>
  within(screen.getByRole('heading', { level: 1 }).parentElement!).getByText(/^v\d+$/)

const historyButton = () => screen.getByRole('button', { name: 'Histórico' })
const sheet = () => screen.getByRole('dialog', { name: 'Histórico de versões' })
const versions = () => within(sheet()).getByRole('list', { name: 'Versões' })
const rowOf = (version: number) =>
  within(versions())
    .getAllByRole('listitem')
    .find((item) => item.textContent?.startsWith(`v${version}`))!

async function openHistory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(historyButton())
  return within(await screen.findByRole('list', { name: 'Versões' }))
}

async function openRestore(user: ReturnType<typeof userEvent.setup>, version = 5) {
  await openHistory(user)
  await user.click(within(rowOf(version)).getByRole('button', { name: `Restaurar a v${version}` }))
  return screen.findByRole('alertdialog', { name: `Restaurar a v${version}?` })
}

describe('botão Histórico', () => {
  it('na criação não existe; na edição existe e nada é pedido antes de abrir', async () => {
    const seen = serve()
    const { view } = await renderNew()
    expect(screen.queryByRole('button', { name: 'Histórico' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^v\d+$/)).not.toBeInTheDocument()
    view.unmount()

    await renderAgent()
    expect(await screen.findByRole('button', { name: 'Histórico' })).toBeVisible()
    expect(seen.history).toEqual([])
  })

  it.each([
    ['teams', TeamEditor, { id: 'suporte', nome: 'Suporte', descricao: '', prompt: '', active: true, member_ids: [], mode: 'route', factoryIaModel: 'ollama', model: 'llama3.2', version: 2 }],
    ['tools', ToolEditor, { id: 'clima', name: 'Clima', description: 'Previsão', route: 'https://clima.example.com/v1', http_method: 'GET', parameters: [], instructions: '', headers: {}, active: false, version: 2 }]
  ] as const)('%s: também tem o Histórico (inativa inclusive), que pede a 1ª página do item', async (kind, Editor, entity) => {
    const urls: string[] = []
    server.use(
      http.get('*/api/agents', () => HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })),
      http.get(`*/api/${kind}/:id`, () => HttpResponse.json({ success: true, data: entity })),
      http.get(`*/api/${kind}/:id/history`, ({ request }) => {
        urls.push(new URL(request.url).pathname + new URL(request.url).search)
        return page([])
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<Editor id={entity.id} />)

    await user.click(await screen.findByRole('button', { name: 'Histórico' }))

    expect(await screen.findByText('Nenhuma versão registrada')).toBeVisible()
    expect(urls).toEqual([`/api/${kind}/${entity.id}/history?offset=0&limit=20`])
  })
})

describe('Sheet do histórico', () => {
  it('carregando: skeleton com aria-busy; depois a lista com título e descrição', async () => {
    serve({ history: async () => (await delay(50), page(HISTORY, 47)) })
    const { user } = await renderAgent()

    await user.click(historyButton())

    const body = within(sheet()).getByText('Carregando o histórico…').parentElement!
    expect(body).toHaveAttribute('aria-busy', 'true')
    await screen.findByRole('list', { name: 'Versões' })
    expect(body).toHaveAttribute('aria-busy', 'false')
    expect(sheet()).toHaveAccessibleDescription(
      'Agente Pedidos · 47 versões. Mais nova primeiro; datas no seu fuso.'
    )
  })

  it('cada linha: versão, ator com a explicação, data com ISO e chips (até 3 + "+N"); a atual tem "Atual" e nenhum Restaurar', async () => {
    serve()
    const { user } = await renderAgent()
    await openHistory(user)

    const current = within(rowOf(8))
    expect(current.getByText('Atual')).toBeVisible()
    expect(current.getByText('Versão aberta no editor: já é o conteúdo atual.')).toBeVisible()
    expect(current.queryByRole('button', { name: /Restaurar/ })).not.toBeInTheDocument()
    expect(rowOf(8)).toHaveClass('bg-muted')

    const v7Row = within(rowOf(7))
    expect(v7Row.getByText('local-dev').parentElement).toHaveAttribute(
      'title',
      'Papel da chave, não o nome de uma pessoa'
    )
    const time = rowOf(7).querySelector('time')!
    expect(time).toHaveAttribute('datetime', AT)
    expect(time).toHaveAttribute('title', '2026-11-14T17:32:00.000Z (UTC)')
    expect(within(v7Row.getByRole('group', { name: 'Campos alterados' })).getAllByText(/.+/).map((chip) => chip.textContent)).toEqual([
      'Modelo',
      'Instruções do sistema'
    ])
    expect(v7Row.getByRole('button', { name: 'Restaurar a v7' })).toBeVisible()

    // Nome, Descrição, Modelo, Prompt e Ativo: 3 + "+2".
    const chips = within(within(rowOf(5)).getByRole('group', { name: 'Campos alterados' })).getAllByText(/.+/)
    expect(chips.map((chip) => chip.textContent)).toEqual(['Nome', 'Descrição', 'Modelo', '+2'])
  })

  it('remoção: "Removida", sem diff nem Restaurar; criação: o que ela preencheu, com "ausente" antes', async () => {
    serve()
    const { user } = await renderAgent()
    await openHistory(user)

    const removal = within(rowOf(3))
    expect(removal.getByText('Removida')).toBeVisible()
    expect(removal.queryByRole('button')).not.toBeInTheDocument()

    await user.click(within(rowOf(1)).getByRole('button', { name: 'Ver alterações' }))
    const diff = within(within(rowOf(1)).getByRole('region', { name: 'Campos alterados na v1' }))
    expect(diff.getAllByText('ausente').length).toBeGreaterThan(0)
    expect(diff.getByText('Pedidos v1')).toBeVisible()
    expect(within(rowOf(1)).getByRole('button', { name: 'Restaurar a v1' })).toBeVisible()
  })

  it('Ver alterações abre o Antes × Depois da versão (várias abertas ao mesmo tempo) e Ocultar fecha', async () => {
    serve()
    const { user } = await renderAgent()
    await openHistory(user)

    const toggle = within(rowOf(7)).getByRole('button', { name: 'Ver alterações' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAccessibleName('Ocultar alterações')
    const diff = within(rowOf(7)).getByRole('region', { name: 'Campos alterados na v7' })
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toContainElement(diff)
    const model = within(diff).getByText('Modelo').closest('li')!
    expect(within(model).getAllByRole('term').map((term) => term.textContent)).toEqual(['Antes', 'Depois'])
    expect(within(model).getAllByRole('definition').map((cell) => cell.textContent)).toEqual(['gpt-4o-mini', 'gpt-4o'])

    await user.click(within(rowOf(8)).getByRole('button', { name: 'Ver alterações' }))
    expect(within(rowOf(8)).getByRole('region', { name: 'Campos alterados na v8' })).toBeVisible()
    expect(within(rowOf(7)).getByRole('region', { name: 'Campos alterados na v7' })).toBeVisible()

    await user.click(toggle)
    expect(within(rowOf(7)).queryByRole('region')).not.toBeInTheDocument()
  })

  it('vazio (sem escritas ou store YAML): a explicação, sem lista', async () => {
    serve({ history: () => page([]) })
    const { user } = await renderAgent()

    await user.click(historyButton())

    expect(await within(sheet()).findByRole('heading', { name: 'Nenhuma versão registrada' })).toBeVisible()
    expect(
      within(sheet()).getByText(/Se a configuração vem de arquivo YAML \(somente leitura\), ele fica sempre vazio/)
    ).toBeVisible()
    expect(within(sheet()).queryByRole('list')).not.toBeInTheDocument()
    expect(sheet()).toHaveAccessibleDescription('Agente Pedidos.')
  })

  it('erro: alerta com o código e Tentar de novo refaz o GET; o formulário fica como estava', async () => {
    let calls = 0
    const seen = serve({
      history: () => (calls++ === 0 ? HttpResponse.json({ success: false, error: 'unreachable' }, { status: 503 }) : page(HISTORY))
    })
    const { user } = await renderAgent()
    await user.click(historyButton())

    const alert = await within(sheet()).findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar o histórico')
    expect(alert).toHaveTextContent('Código 503. O formulário não foi afetado.')
    await user.click(within(alert).getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('list', { name: 'Versões' })).toBeVisible()
    expect(seen.history).toHaveLength(2)
  })

  it('rede fora: o erro sem código', async () => {
    serve({ history: () => HttpResponse.error() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = await renderAgent()
    await user.click(historyButton())

    expect(await within(sheet()).findByRole('alert')).toHaveTextContent('O formulário não foi afetado.')
    expect(within(sheet()).getByRole('alert')).not.toHaveTextContent('Código')
  })
})

describe('paginação', () => {
  // 25 versões: a 1ª página com 20, a 2ª com 5.
  const many = Array.from({ length: 25 }, (_, index) =>
    entry(25 - index, at(25 - index, { nome: `Nome ${25 - index}` }), at(25 - index, { nome: `Nome ${24 - index}` }))
  )
  const paged: Respond = (request) => {
    const offset = Number(new URL(request.url).searchParams.get('offset'))
    return page(many.slice(offset, offset + 20), many.length, offset)
  }

  it('Carregar mais acrescenta a próxima página pelo offset e a contagem chega ao fim', async () => {
    const seen = serve({ history: paged })
    const { user } = await renderAgent()
    await openHistory(user)

    expect(within(sheet()).getByRole('status')).toHaveTextContent('20 de 25 versões')
    await user.click(within(sheet()).getByRole('button', { name: 'Carregar mais' }))

    await waitFor(() => expect(within(versions()).getAllByRole('listitem')).toHaveLength(25))
    expect(within(sheet()).getByRole('status')).toHaveTextContent('Fim: 25 de 25 versões')
    expect(within(sheet()).queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
    expect(seen.history).toEqual([
      '/api/agents/pedidos/history?offset=0&limit=20',
      '/api/agents/pedidos/history?offset=20&limit=20'
    ])
  })

  it('clique duplo em Carregar mais faz um pedido só', async () => {
    const seen = serve({ history: async (request) => (await delay(30), paged(request)) })
    const { user } = await renderAgent()
    await openHistory(user)

    await user.dblClick(within(sheet()).getByRole('button', { name: 'Carregar mais' }))

    await waitFor(() => expect(within(versions()).getAllByRole('listitem')).toHaveLength(25))
    expect(seen.history).toHaveLength(2)
  })

  it('erro ao carregar mais: mensagem com o código e Tentar de novo; a lista que já veio fica', async () => {
    let calls = 0
    serve({
      history: (request) =>
        calls++ === 1 ? HttpResponse.json({ success: false, error: 'server_error' }, { status: 502 }) : paged(request)
    })
    const { user } = await renderAgent()
    await openHistory(user)

    await user.click(within(sheet()).getByRole('button', { name: 'Carregar mais' }))

    expect(await within(sheet()).findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar mais versões (código 502).'
    )
    expect(within(versions()).getAllByRole('listitem')).toHaveLength(20)
    await user.click(within(sheet()).getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(within(versions()).getAllByRole('listitem')).toHaveLength(25))
  })
})

describe('corridas', () => {
  it('fechar com o GET pendente descarta a resposta; reabrir pede de novo; o foco volta ao Histórico', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    let calls = 0
    const seen = serve({
      history: async () => {
        if (calls++ === 0) {
          await gate
          return page([v8])
        }
        return page([v8, v7])
      }
    })
    const { user } = await renderAgent()

    await user.click(historyButton())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(historyButton()).toHaveFocus()

    await user.click(historyButton())
    await waitFor(() => expect(within(versions()).getAllByRole('listitem')).toHaveLength(2))
    await act(async () => release())
    await delay(20)
    expect(within(versions()).getAllByRole('listitem')).toHaveLength(2)
    expect(seen.history).toHaveLength(2)
  })

  it('GET pendente quando o editor desmonta (outra entidade): a resposta velha não aparece no editor novo', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    serve({
      history: async () => {
        await gate
        return page([v8])
      },
      gets: [agent]
    })
    const { user, view } = await renderAgent()
    await user.click(historyButton())

    view.rerender(
      <RuntimeRevisionProvider>
        <AgentEditor id="outro" />
      </RuntimeRevisionProvider>
    )
    await act(async () => release())
    await delay(20)

    expect(screen.queryByRole('list', { name: 'Versões' })).not.toBeInTheDocument()
  })
})

describe('restaurar: confirmação', () => {
  it('"Hoje (v8) × depois": o que muda com o estado (D-P4-04-3); foco em Cancelar, que fecha sem pedir', async () => {
    const seen = serve()
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    expect(dialog).toHaveAccessibleDescription(
      /^Cria a v9 com o conteúdo da v5 \(.+\) e aplica no runtime\. A v5 e as demais continuam no histórico\.$/
    )
    const list = within(within(dialog).getByRole('region', { name: 'Campos que mudam' }))
    expect(list.getAllByRole('listitem').map((row) => row.querySelector('p')?.textContent)).toEqual([
      'Nome',
      'Descrição',
      'Modelo',
      'Instruções do sistema',
      'Ativo'
    ])
    const active = list.getByText('Ativo').closest('li')!
    expect(within(active).getAllByRole('definition').map((cell) => cell.textContent)).toEqual(['Ligado', 'Desligado'])
    expect(within(dialog).getByText('Hoje (v8) × depois de restaurar. Os campos que não aparecem aqui não mudam.')).toBeVisible()
    expect(within(dialog).queryByText(/edições não salvas/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(sheet()).toBeVisible()
    await waitFor(() => expect(within(rowOf(5)).getByRole('button', { name: 'Restaurar a v5' })).toHaveFocus())
    expect(seen.restores).toEqual([])
  })

  it('com edição não salva, o aviso de que restaurar a descarta (D-P4-04-2)', async () => {
    serve()
    const { user } = await renderAgent()
    await user.type(await screen.findByLabelText('Nome *'), ' editado')

    const dialog = await openRestore(user)

    expect(within(dialog).getByText('Você tem edições não salvas no formulário. Restaurar as descarta.')).toBeVisible()
  })

  it('versão igual à atual: avisa e o Restaurar fica desabilitado', async () => {
    serve({ history: () => page([v8, entry(6, at(6), at(6, { nome: 'x' }))]) })
    const { user } = await renderAgent()
    const dialog = await openRestore(user, 6)

    expect(within(dialog).getByText('Esta versão é igual à atual.')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Restaurar a v6' })).toBeDisabled()
  })
})

describe('restaurar: desfechos', () => {
  it('200: POST da versão com o If-Match lido; fecha tudo, o editor passa ao restaurado com o status "v5 restaurada como v9" e o foco no h1', async () => {
    const seen = serve()
    const { user } = await renderAgent()
    await user.type(await screen.findByLabelText('Nome *'), ' editado')
    expect(versionBadge()).toHaveTextContent('v8')
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    const status = await screen.findByText('v5 restaurada como v9.')
    expect(versionBadge()).toHaveTextContent('v9')
    expect(status.parentElement).toHaveTextContent('v5 restaurada como v9. Mudança aplicada na revisão 12 do runtime.')
    expect(seen.restores).toEqual([{ path: '/api/agents/pedidos/history/5/restore', ifMatch: '"8"' }])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    // Edição descartada; o restaurado está inativo (o badge muda).
    expect(screen.getByLabelText('Nome *')).toHaveValue('Antigo')
    expect(screen.getByText('Inativo')).toBeVisible()
    expect(screen.getByText('Orquestrador online, revisão 12')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
  })

  it('200 reabrindo o histórico: a lista recarrega e a atual passa a ser a v9', async () => {
    let calls = 0
    serve({
      history: () => page(calls++ === 0 ? HISTORY : [entry(9, at(9, v5.document as object), agent), ...HISTORY])
    })
    const { user } = await renderAgent()
    const dialog = await openRestore(user)
    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))
    await screen.findByText('v5 restaurada como v9.')

    await openHistory(user)

    expect(within(rowOf(9)).getByText('Atual')).toBeVisible()
    expect(within(rowOf(8)).getByRole('button', { name: 'Restaurar a v8' })).toBeVisible()
  })

  it('gravando: "Restaurando…" com tudo desabilitado e aria-busy; Esc não fecha', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    serve({
      restore: async () => {
        await gate
        return HttpResponse.json({ success: true, data: at(9), runtimeRevision: 12 })
      }
    })
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    expect(dialog).toHaveAttribute('aria-busy', 'true')
    expect(within(dialog).getByRole('button', { name: 'Restaurando…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Fechar' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeVisible()
    await act(async () => release())
    expect(await screen.findByText('v5 restaurada como v9.')).toBeVisible()
  })

  it('412: fecha diálogo e Sheet e abre o conflito em modo restaurar, só com "Recarregar a versão atual" (D-P4-04-4)', async () => {
    const latest = at(10, { model: 'claude', nome: 'De outra pessoa' })
    serve({
      restore: () => HttpResponse.json({ success: false, error: 'version_conflict' }, { status: 412 }),
      gets: [agent, latest]
    })
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    const conflict = await screen.findByRole('dialog', { name: 'O agente mudou' })
    await waitFor(() =>
      expect(conflict).toHaveAccessibleDescription(
        'Uma versão mais nova (v10) foi salva antes de restaurar a v5. 5 campos da v5 diferem da versão atual.'
      )
    )
    expect(screen.queryByRole('dialog', { name: 'Histórico de versões' })).not.toBeInTheDocument()
    const columns = within(conflict).getAllByRole('term').slice(0, 2).map((term) => term.textContent)
    expect(columns).toEqual(['O seu valor', 'Atual'])
    expect(within(conflict).getByText('Antigo')).toBeVisible()
    expect(within(conflict).getByText('De outra pessoa')).toBeVisible()
    expect(within(conflict).queryByRole('button', { name: 'Salvar as minhas por cima' })).not.toBeInTheDocument()
    expect(within(conflict).getByRole('button', { name: 'Voltar ao formulário' })).toHaveFocus()

    await user.click(within(conflict).getByRole('button', { name: 'Recarregar a versão atual' }))

    expect(await screen.findByLabelText('Nome *')).toHaveValue('De outra pessoa')
  })

  it('404: toast da versão fora do histórico, o diálogo fecha e a lista recarrega', async () => {
    const seen = serve({ restore: () => HttpResponse.json({ success: false, error: 'not_found' }, { status: 404 }) })
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    expect(await screen.findByText('Essa versão não está mais no histórico.')).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(seen.history).toHaveLength(2))
    expect(await screen.findByRole('list', { name: 'Versões' })).toBeVisible()
  })

  it('409: toast do store YAML; o diálogo fecha e o Sheet fica', async () => {
    serve({ restore: () => HttpResponse.json({ success: false, error: 'conflict' }, { status: 409 }) })
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    expect(
      await screen.findByText('Este ambiente guarda a configuração em arquivo YAML e não permite restaurar.')
    ).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(sheet()).toBeVisible()
  })

  it.each([
    ['não monta (tipo do erro)', { error: 'not_applied', errorType: 'ValueError' }, 'ValueError'],
    ['campo recusado', { error: 'invalid_config', field: 'factoryIaModel' }, 'factoryIaModel'],
    ['sem detalhe', { error: 'not_applied' }, undefined]
  ])('422 (%s): o motivo fica no diálogo, que segue aberto com o Restaurar ativo', async (_, body, detail) => {
    serve({ restore: () => HttpResponse.json({ success: false, ...body }, { status: 422 }) })
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('A v5 não funciona mais no runtime. Nada foi alterado.')
    if (detail) expect(within(alert).getByText(detail)).toBeVisible()
    else expect(alert).not.toHaveTextContent('Detalhe técnico')
    expect(within(dialog).getByRole('button', { name: 'Restaurar a v5' })).toBeEnabled()
    expect(screen.getByLabelText('Nome *')).toHaveValue('Pedidos')
  })

  it('502 não confirmada: fecha tudo e o editor mostra o bloco "não confirmada" com Recarregar', async () => {
    serve({ restore: () => HttpResponse.json({ success: false, error: 'not_confirmed' }, { status: 502 }) })
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    expect(await screen.findByText('Não confirmada: o orquestrador falhou depois de receber a mudança.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Recarregar agente' })).toBeVisible()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden_origin'],
    [503, 'unreachable']
  ])('%i: toast com o código; o diálogo fecha e o foco volta ao Restaurar da linha', async (code, error) => {
    serve({ restore: () => HttpResponse.json({ success: false, error }, { status: code }) })
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    expect(await screen.findByText(`Não foi possível restaurar a versão (código ${code})`)).toBeVisible()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(within(rowOf(5)).getByRole('button', { name: 'Restaurar a v5' })).toHaveFocus())
  })

  it('rede fora: toast sem código', async () => {
    serve({ restore: () => HttpResponse.error() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = await renderAgent()
    const dialog = await openRestore(user)

    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v5' }))

    expect(await screen.findByText('Não foi possível restaurar a versão')).toBeVisible()
  })
})

describe('tool: header no histórico', () => {
  const tool = {
    id: 'clima',
    name: 'Clima',
    description: 'Previsão',
    route: 'https://clima.example.com/v1',
    http_method: 'GET',
    parameters: [],
    instructions: '',
    headers: { Authorization: '***', 'X-Ref': 'env:CLIMA_API_KEY' },
    active: true,
    version: 4
  }

  it('só o valor oculto mudou: o aviso de mudança fora do formulário; header novo aparece sem valor', async () => {
    server.use(
      http.get('*/api/tools/:id', () => HttpResponse.json({ success: true, data: tool })),
      http.get('*/api/tools/:id/history', () =>
        page([
          entry(4, tool, { ...tool, version: 4 }),
          entry(3, { ...tool, version: 3 }, { ...tool, version: 3, headers: { 'X-Ref': 'env:CLIMA_API_KEY' } })
        ])
      )
    )
    const user = userEvent.setup()
    renderWithIntl(<ToolEditor id="clima" />)
    await user.click(await screen.findByRole('button', { name: 'Histórico' }))
    await screen.findByRole('list', { name: 'Versões' })

    expect(within(rowOf(4)).getByText('A mudança não aparece no formulário (por exemplo, o valor oculto de um cabeçalho).')).toBeVisible()
    expect(within(rowOf(4)).queryByRole('button', { name: 'Ver alterações' })).not.toBeInTheDocument()

    await user.click(within(rowOf(3)).getByRole('button', { name: 'Ver alterações' }))
    const diff = within(rowOf(3)).getByRole('region', { name: 'Campos alterados na v3' })
    expect(within(diff).getByText('Authorization')).toBeVisible()
    expect(diff).not.toHaveTextContent('Bearer')
    expect(within(diff).getByText('oculto')).toBeVisible()
  })
})

describe.each([
  {
    kind: 'teams',
    Editor: TeamEditor,
    entity: { id: 'suporte', nome: 'Suporte', descricao: '', prompt: '', active: true, member_ids: [], mode: 'route', factoryIaModel: 'ollama', model: 'llama3.2', version: 2 },
    old: { nome: 'Suporte antigo', mode: 'coordinate' },
    nameLabel: 'Nome *',
    nameKey: 'nome',
    badge: 'Ativo'
  },
  {
    // Inativa (D-P4-04-3): restaurar uma versão ativa a reativa.
    kind: 'tools',
    Editor: ToolEditor,
    entity: { id: 'clima', name: 'Clima', description: 'Previsão', route: 'https://clima.example.com/v1', http_method: 'GET', parameters: [], instructions: '', headers: {}, active: false, version: 2 },
    old: { name: 'Clima antigo', active: true },
    nameLabel: 'Nome *',
    nameKey: 'name',
    badge: 'Ativa'
  }
] as const)('$kind: restaurar', ({ kind, Editor, entity, old, nameLabel, nameKey, badge }) => {
  const chosen = { ...entity, ...old, version: 1 }
  const history = [entry(2, entity, chosen), entry(1, chosen, null)]

  function serveKind(restore: Respond, gets: object[] = [entity]) {
    let reads = 0
    const restores: (string | null)[] = []
    server.use(
      http.get('*/api/agents', () =>
        HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })
      ),
      http.get(`*/api/${kind}/:id`, () => HttpResponse.json({ success: true, data: gets[Math.min(reads++, gets.length - 1)] })),
      http.get(`*/api/${kind}/:id/history`, () => page(history)),
      http.post(`*/api/${kind}/:id/history/:version/restore`, ({ request }) => {
        restores.push(request.headers.get('if-match'))
        return restore(request)
      })
    )
    return restores
  }

  async function restoreV1() {
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <Editor id={entity.id} />
        <Toaster />
      </>
    )
    await user.click(await screen.findByRole('button', { name: 'Histórico' }))
    await screen.findByRole('list', { name: 'Versões' })
    await user.click(within(rowOf(1)).getByRole('button', { name: 'Restaurar a v1' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Restaurar a v1?' })
    await user.click(within(dialog).getByRole('button', { name: 'Restaurar a v1' }))
    return user
  }

  it('200: o editor passa ao restaurado, com o status e o badge do estado', async () => {
    const restores = serveKind(() => HttpResponse.json({ success: true, data: { ...chosen, version: 3 }, runtimeRevision: 4 }))

    await restoreV1()

    expect(await screen.findByText('v1 restaurada como v3.')).toBeVisible()
    expect(versionBadge()).toHaveTextContent('v3')
    expect(screen.getByLabelText(nameLabel)).toHaveValue(chosen[nameKey])
    expect(screen.getByText(badge)).toBeVisible()
    expect(restores).toEqual(['"2"'])
  })

  it('412: o conflito em modo restaurar, e recarregar abre a atual', async () => {
    const latest = { ...entity, [nameKey]: 'De outra pessoa', version: 5 }
    serveKind(() => HttpResponse.json({ success: false, error: 'version_conflict' }, { status: 412 }), [entity, latest])

    const user = await restoreV1()

    const conflict = await screen.findByRole('dialog', { name: kind === 'teams' ? 'O team mudou' : 'A tool mudou' })
    await user.click(await within(conflict).findByRole('button', { name: 'Recarregar a versão atual' }))
    expect(await screen.findByLabelText(nameLabel)).toHaveValue('De outra pessoa')
  })
})

describe('números de versão repetidos (id removido e recriado)', () => {
  it('só a entrada mais nova de cada número é Atual ou restaurável (é a que o orquestrador restaura)', async () => {
    const current = at(2)
    serve({
      gets: [current],
      history: () =>
        page([
          entry(2, current, at(2, { nome: 'Nova 1' })),
          entry(1, at(1, { nome: 'Nova 1' }), null),
          entry(2, null, null),
          entry(2, at(2, { nome: 'Velha 2' }), at(2, { nome: 'Velha 1' })),
          entry(1, at(1, { nome: 'Velha 1' }), null)
        ])
    })
    const { user } = await renderAgent()
    await openHistory(user)

    const items = within(versions()).getAllByRole('listitem')
    expect(items.map((item) => within(item).queryByText('Atual') !== null)).toEqual([true, false, false, false, false])
    expect(items.map((item) => within(item).queryByRole('button', { name: /^Restaurar a v/ }) !== null)).toEqual([
      false,
      true,
      false,
      false,
      false
    ])
  })
})

describe('badge da versão (D-P4-04-7)', () => {
  it('mostra a versão lida e muda no 200 do Salvar', async () => {
    serve()
    server.use(
      http.put('*/api/agents/:id', () =>
        HttpResponse.json({ success: true, data: at(9, { nome: 'Pedidos novo' }), runtimeRevision: 13 })
      )
    )
    const { user } = await renderAgent()
    expect(versionBadge()).toHaveTextContent('v8')

    const name = await screen.findByLabelText('Nome *')
    await user.clear(name)
    await user.type(name, 'Pedidos novo')
    await saveAndConfirm(user)

    await screen.findByText('Agente salvo.')
    expect(versionBadge()).toHaveTextContent('v9')
  })
})

describe('Sheet fechado (R1)', () => {
  // Salvar com o histórico já aberto e fechado compara o mesmo que sem nunca o abrir:
  // as páginas lidas saem com o Sheet e não são recalculadas quando a versão muda.
  async function saveCountingDiffs(openFirst: boolean) {
    serve()
    server.use(
      http.put('*/api/agents/:id', () => HttpResponse.json({ success: true, data: at(9), runtimeRevision: 13 }))
    )
    const { user, view } = await renderAgent()
    if (openFirst) {
      await openHistory(user)
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }
    vi.mocked(diffAgent).mockClear()
    await user.type(await screen.findByLabelText('Nome *'), ' x')
    await saveAndConfirm(user)
    await screen.findByText('Agente salvo.')
    const calls = vi.mocked(diffAgent).mock.calls.length
    view.unmount()
    return calls
  }

  it('salvar com o Sheet fechado não refaz as linhas do histórico', async () => {
    const never = await saveCountingDiffs(false)
    const closed = await saveCountingDiffs(true)

    expect(closed).toBe(never)
  })
})
