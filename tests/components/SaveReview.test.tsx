import { Profiler } from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { AgentForm } from '@/components/management/agents/AgentForm'
import { TeamEditor } from '@/components/management/teams/TeamEditor'
import { ToolEditor } from '@/components/management/tools/ToolEditor'
import type { AgentConfig } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { paste, stubBrowserApis } from '../helpers/toolForm'
import { saveAndConfirm } from '../helpers/saveReview'
import { SCHEMA_URL, schemaFixture } from '../msw/handlers'
import { server } from '../msw/server'

// P4-02: o diálogo "Revisar antes de salvar" e o Salvar sem mudança, nos três
// editores. Spec: docs/design/P4-02.md (§2, §4, §6, §7, §14).
const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

beforeAll(stubBrowserApis)

// Documentos crus: sem execução, sem RAG, como o orquestrador pode devolver.
const agent: AgentConfig = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: '',
  prompt: 'Seja útil.',
  active: true,
  tools_ids: ['clima'],
  version: 5
}
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
  version: 3
}
const tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão',
  route: 'https://clima.example.com/{cidade}',
  http_method: 'GET',
  // O parâmetro da rota gravado como opcional: `toPayload` o força nos dois lados.
  parameters: [{ name: 'cidade', type: 'string', description: 'Cidade', required: false }],
  instructions: '',
  headers: { 'X-Api-Key': '***', 'X-Conta': 'env:CLIMA_API_KEY' },
  active: true,
  version: 8
}

const KINDS = {
  agents: { Editor: AgentEditor, entity: agent, id: 'assistente', nameKey: 'nome', saved: 'Agente salvo.', conflict: 'O agente mudou' },
  teams: { Editor: TeamEditor, entity: team, id: 'suporte', nameKey: 'nome', saved: 'Team salvo.', conflict: 'O team mudou' },
  tools: { Editor: ToolEditor, entity: tool, id: 'clima', nameKey: 'name', saved: 'Tool salva.', conflict: 'A tool mudou' }
} as const
type Kind = keyof typeof KINDS
const KIND_NAMES = Object.keys(KINDS) as Kind[]

const page = (data: object[]) => ({
  success: true,
  data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 }
})
const tools = [
  { ...tool, id: 'clima', name: 'Clima' },
  { ...tool, id: 'busca', name: 'Busca' }
]

type Sent = { method: string; ifMatch: string | null; body: Record<string, unknown> }
type Respond = () => Response | Promise<Response>

/** O BFF do editor; devolve as escritas vistas. */
function serve(kind: Kind, writes: Respond[] = [], entity: object = KINDS[kind].entity, gets: object[] = []) {
  const sent: Sent[] = []
  let reads = 0
  server.use(
    http.get('*/api/tools', () => HttpResponse.json(page(tools))),
    http.get('*/api/agents', () => HttpResponse.json(page([agent, { ...agent, id: 'outro', nome: 'Outro' }]))),
    http.get(`*/api/${kind}/:id`, () =>
      HttpResponse.json({ success: true, data: reads++ === 0 ? entity : (gets[0] ?? entity) })
    ),
    http.put(`*/api/${kind}/:id`, async ({ request }) => {
      sent.push({
        method: 'PUT',
        ifMatch: request.headers.get('if-match'),
        body: (await request.json()) as Record<string, unknown>
      })
      const body = sent[sent.length - 1].body
      const respond = writes[Math.min(sent.length - 1, writes.length - 1)]
      return respond
        ? respond()
        : HttpResponse.json({ success: true, data: { ...entity, ...body, version: 99 }, runtimeRevision: 12 })
    }),
    http.post(`*/api/${kind}`, async ({ request }) => {
      sent.push({ method: 'POST', ifMatch: null, body: (await request.json()) as Record<string, unknown> })
      return HttpResponse.json({ success: true, data: { version: 1 } })
    })
  )
  return sent
}

const save = () => screen.getByRole('button', { name: 'Salvar' })
const HINT = 'Nenhuma alteração para salvar.'
const reviewDialog = () => screen.findByRole('dialog', { name: 'Revisar antes de salvar' })
const back = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Voltar ao formulário' })
const confirm = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Confirmar e salvar' })

async function open(kind: Kind) {
  const { Editor, id } = KINDS[kind]
  const user = userEvent.setup()
  renderWithIntl(
    <>
      <Editor id={id} />
      <Toaster />
    </>
  )
  // O Salvar só sai do `disabled` com o schema (e, no team, os membros) prontos.
  await waitFor(() => expect(save()).toBeEnabled())
  return user
}

// Clique fora: o Radix fecha no pointerdown fora do conteúdo (o overlay).
const clickOutside = () => fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' })

// Na tool, "Nome *" também rotula a coluna dos parâmetros; o da entidade é o 1º.
const nameField = () => screen.getAllByLabelText('Nome *')[0]

async function rename(user: ReturnType<typeof userEvent.setup>, value = 'Novo nome') {
  const name = nameField()
  await user.clear(name)
  await user.type(name, value)
}

describe.each(KIND_NAMES)('Salvar sem mudança (%s)', (kind) => {
  it('V-1: documento cru sem tocar: aria-disabled, dica visível ligada pelo aria-describedby, alcançável por Tab', async () => {
    serve(kind)
    await open(kind)

    expect(save()).toHaveAttribute('aria-disabled', 'true')
    expect(save()).toHaveAccessibleDescription(HINT)
    expect(screen.getByText(HINT)).toHaveClass('text-xs', 'text-muted-foreground')
    expect(screen.getByText(HINT)).not.toHaveClass('sr-only')
    save().focus()
    expect(save()).toHaveFocus()
  })

  it('V-2: a 1ª edição acende e tira a dica; desfazer apaga e a dica volta', async () => {
    serve(kind)
    const user = await open(kind)

    await user.type(nameField(), 'x')
    expect(save()).not.toHaveAttribute('aria-disabled')
    expect(save()).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()

    await user.type(nameField(), '{Backspace}')
    expect(save()).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(HINT)).toBeInTheDocument()
  })

  it('guarda: Enter num campo e Enter no Salvar sem mudança não abrem o diálogo nem enviam', async () => {
    const sent = serve(kind)
    const user = await open(kind)

    await user.type(nameField(), '{Enter}')
    save().focus()
    await user.keyboard('{Enter}')
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sent).toEqual([])
    expect(nameField()).not.toHaveAttribute('aria-invalid', 'true')
  })
})

describe.each(KIND_NAMES)('Diálogo de revisão (%s)', (kind) => {
  it('V-3, V-4, V-5: abre sem request, com a versão lida, foco em Voltar, e lista só o alterado (Antes × Depois)', async () => {
    const sent = serve(kind)
    const user = await open(kind)
    await rename(user)

    await user.click(save())
    const dialog = await reviewDialog()

    const { entity, nameKey } = KINDS[kind]
    expect(dialog).toHaveAccessibleDescription(
      `1 alteração em relação à v${entity.version}, a versão que você abriu. Nada é enviado até você confirmar.`
    )
    await waitFor(() => expect(back(dialog)).toHaveFocus())
    const list = within(dialog).getByRole('region', { name: 'Campos alterados' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    const before = within(rows[0]).getByText('Antes')
    const after = within(rows[0]).getByText('Depois')
    expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(before.nextElementSibling).toHaveTextContent(String(entity[nameKey as keyof typeof entity]))
    expect(after.nextElementSibling).toHaveTextContent('Novo nome')
    expect(dialog).toHaveTextContent('Os campos que não aparecem aqui não mudam.')
    expect(sent).toEqual([])
  })

  it.each(['Voltar', 'Esc', 'X', 'clique fora'])('V-10: %s fecha sem request, foco no Salvar, edições e Salvar ativo', async (way) => {
    const sent = serve(kind)
    const user = await open(kind)
    await rename(user)

    await user.click(save())
    const dialog = await reviewDialog()
    await waitFor(() => expect(back(dialog)).toHaveFocus())
    if (way === 'Voltar') await user.click(back(dialog))
    else if (way === 'Esc') await user.keyboard('{Escape}')
    else if (way === 'clique fora') clickOutside()
    else await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(save()).toHaveFocus())
    expect(nameField()).toHaveValue('Novo nome')
    expect(save()).not.toHaveAttribute('aria-disabled')
    expect(sent).toEqual([])
  })

  it('V-11: gravando: spinner, tudo desabilitado (X inclusive), Esc e clique fora não fecham e o foco fica no diálogo', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    serve(kind, [
      async () => {
        await gate
        return HttpResponse.json({ success: true, data: { ...KINDS[kind].entity, version: 99 } })
      }
    ])
    const user = await open(kind)
    await rename(user)
    await user.click(save())
    const dialog = await reviewDialog()

    await user.click(confirm(dialog))

    const saving = await within(dialog).findByRole('button', { name: 'Salvando…' })
    expect(saving).toBeDisabled()
    expect(saving.querySelector('svg')).toHaveClass('animate-spin')
    expect(back(dialog)).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Fechar' })).toBeDisabled()
    expect(dialog).toHaveAttribute('aria-busy', 'true')
    await waitFor(() => expect(dialog).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Revisar antes de salvar' })).toBeInTheDocument()
    clickOutside()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getByRole('dialog', { name: 'Revisar antes de salvar' })).toBeInTheDocument()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('V-12: 200: fecha, envia o que foi listado com o If-Match lido, status, Salvar sem mudança com o foco e dica sr-only', async () => {
    const sent = serve(kind)
    const user = await open(kind)
    await rename(user)

    await saveAndConfirm(user)

    expect(await screen.findByText(KINDS[kind].saved)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sent).toHaveLength(1)
    expect(sent[0].ifMatch).toBe(`"${KINDS[kind].entity.version}"`)
    expect(sent[0].body[KINDS[kind].nameKey]).toBe('Novo nome')
    await waitFor(() => expect(save()).toHaveFocus())
    await waitFor(() => expect(save()).toHaveAttribute('aria-disabled', 'true'))
    expect(screen.getByText(HINT)).toHaveClass('sr-only')
    expect(save()).toHaveAccessibleDescription(HINT)
  })

  it('depois do 200 o documento salvo é o "Antes": editar acende, reverter ao salvo apaga e a dica fica visível', async () => {
    const sent = serve(kind)
    const user = await open(kind)
    await rename(user, 'Salvo')
    await saveAndConfirm(user)
    await screen.findByText(KINDS[kind].saved)
    await waitFor(() => expect(save()).toHaveAttribute('aria-disabled', 'true'))

    await user.type(nameField(), 'x')
    expect(screen.queryByText(KINDS[kind].saved)).not.toBeInTheDocument()
    expect(save()).not.toHaveAttribute('aria-disabled')
    await user.click(save())
    const dialog = await reviewDialog()
    expect(dialog).toHaveAccessibleDescription(/em relação à v99,/)
    expect(within(dialog).getByText('Antes').nextElementSibling).toHaveTextContent('Salvo')
    await user.click(back(dialog))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.type(nameField(), '{Backspace}')
    expect(save()).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(HINT)).not.toHaveClass('sr-only')
    expect(sent).toHaveLength(1)
  })

  it('V-13: 412: a revisão fecha, o conflito abre sem toast e com foco em Voltar; salvar por cima não passa pela revisão', async () => {
    const { entity, conflict, nameKey } = KINDS[kind]
    const newer = { ...entity, [nameKey]: 'Outra pessoa', version: entity.version + 2 }
    const sent = serve(
      kind,
      [
        () => HttpResponse.json({ success: false, error: 'version_conflict' }, { status: 412 }),
        () => HttpResponse.json({ success: true, data: { ...newer, [nameKey]: 'Novo nome', version: 99 } })
      ],
      entity,
      [newer]
    )
    const user = await open(kind)
    await rename(user)

    await saveAndConfirm(user)

    const dialog = await screen.findByRole('dialog', { name: conflict })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByText(/código 412/)).not.toBeInTheDocument()
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    await waitFor(() => expect(back(dialog)).toHaveFocus())

    await user.click(within(dialog).getByRole('button', { name: 'Salvar as minhas por cima' }))

    expect(await screen.findByText(KINDS[kind].saved)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sent.map((put) => put.ifMatch)).toEqual([`"${entity.version}"`, `"${entity.version + 2}"`])
  })

  it('V-14: 422 com campo: fecha antes, erro no campo e foco nele', async () => {
    const { nameKey } = KINDS[kind]
    serve(kind, [
      () => HttpResponse.json({ success: false, error: 'invalid_config', field: nameKey }, { status: 422 })
    ])
    const user = await open(kind)
    await rename(user)

    await saveAndConfirm(user)

    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(nameField()).toHaveFocus())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(nameField()).toHaveFocus()
  })

  it.each([
    ['422 not_applied', 422, 'not_applied', /^Não aplicada/],
    ['502 not_confirmed', 502, 'not_confirmed', /^Não confirmada/]
  ])('V-14: %s: fecha, bloco da P4-01, edições e Salvar ativo com o foco', async (_name, status, error, title) => {
    serve(kind, [() => HttpResponse.json({ success: false, error }, { status })])
    const user = await open(kind)
    await rename(user)

    await saveAndConfirm(user)

    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(save()).toHaveFocus())
    expect(save()).not.toHaveAttribute('aria-disabled')
    expect(nameField()).toHaveValue('Novo nome')
  })

  it.each([
    ['5xx', () => HttpResponse.json({ success: false, error: 'x' }, { status: 500 }), /código 500/],
    ['rede', () => HttpResponse.error(), /^Não foi possível salvar/]
  ])('V-14: %s: fecha, toast, edições e Salvar ativo com o foco', async (_name, respond, toast) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    serve(kind, [respond])
    const user = await open(kind)
    await rename(user)

    await saveAndConfirm(user)

    expect(await screen.findByText(toast)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(save()).toHaveFocus())
    expect(save()).not.toHaveAttribute('aria-disabled')
    consoleError.mockRestore()
  })

  it('V-15: campo inválido: o diálogo não abre, erro no campo e nenhum request', async () => {
    const sent = serve(kind)
    const user = await open(kind)

    await user.clear(nameField())
    await user.click(save())

    await waitFor(() => expect(nameField()).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it('V-16: só leitura: Salvar disabled, sem dica e sem diálogo', async () => {
    server.use(
      http.get(SCHEMA_URL, () => HttpResponse.json({ success: true, data: { ...schemaFixture, writable: false } }))
    )
    serve(kind)
    const { Editor, id } = KINDS[kind]
    renderWithIntl(<Editor id={id} />)

    expect(await screen.findByText(/somente leitura/i)).toBeInTheDocument()
    expect(save()).toBeDisabled()
    expect(save()).not.toHaveAttribute('aria-disabled')
    expect(save()).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('V-16: schema com erro: Salvar disabled e sem dica', async () => {
    server.use(http.get(SCHEMA_URL, () => HttpResponse.json({ success: false }, { status: 503 })))
    serve(kind)
    const { Editor, id } = KINDS[kind]
    renderWithIntl(<Editor id={id} />)

    await waitFor(() => expect(save()).toBeDisabled())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
    expect(save()).not.toHaveAttribute('aria-disabled')
  })
})

describe('Schema carregando (V-16)', () => {
  it('Salvar disabled e sem dica', async () => {
    server.use(http.get(SCHEMA_URL, () => new Promise<Response>(() => {})))
    serve('agents')
    renderWithIntl(<AgentEditor id={agent.id} />)

    await screen.findByLabelText('Nome *')
    expect(save()).toBeDisabled()
    expect(save()).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })
})

describe('EN (V-19)', () => {
  it('a dica, o diálogo e o marcador vêm do catálogo EN', async () => {
    const lines = Array.from({ length: 12 }, (_, line) => `line ${line}`)
    serve('agents', [], { ...agent, prompt: lines.join('\n') })
    const user = userEvent.setup()
    renderWithIntl(<AgentEditor id={agent.id} />, { locale: 'en' })
    const saveEn = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveEn).toHaveAccessibleDescription('No changes to save.'))

    const edited = [...lines]
    edited[7] = 'edited'
    fireEvent.change(screen.getByLabelText('System prompt'), { target: { value: edited.join('\n') } })
    await user.click(saveEn)

    const dialog = await screen.findByRole('dialog', { name: 'Review before saving' })
    expect(dialog).toHaveAccessibleDescription(
      '1 change compared with v5, the version you opened. Nothing is sent until you confirm.'
    )
    const list = within(dialog).getByRole('region', { name: 'Changed fields' })
    expect(within(list).getAllByText('… 6 identical lines above')).toHaveLength(2)
    expect(within(list).getByText('Before')).toBeInTheDocument()
    expect(within(list).getByText('After')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Fields not listed here stay as they are.')
    expect(within(dialog).getByRole('button', { name: 'Confirm and save' })).toBeEnabled()
  })
})

describe('Criação (D-P4-02-2)', () => {
  it('V-17: agent novo: Salvar ativo sem dica; envia direto, sem diálogo', async () => {
    const sent = serve('agents')
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderWithIntl(<AgentForm onSuccess={onSuccess} />)
    await waitFor(() => expect(save()).toBeEnabled())

    expect(save()).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('ID do agente *'), 'novo')
    await user.type(nameField(), 'Novo')
    await user.type(screen.getByLabelText(/^Modelo \*/), 'm')
    await user.click(save())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].method).toBe('POST')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })
})

describe('Só o que mudou (agent)', () => {
  it('V-2: marcar, desmarcar e marcar de novo uma tool não acende; marcar outra acende', async () => {
    serve('agents')
    const user = await open('agents')
    const clima = await screen.findByRole('checkbox', { name: /Clima/ })

    await user.click(clima)
    expect(save()).not.toHaveAttribute('aria-disabled')
    await user.click(clima)
    expect(save()).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('checkbox', { name: /Busca/ }))
    await user.click(screen.getByRole('checkbox', { name: /Busca/ }))
    expect(save()).toHaveAttribute('aria-disabled', 'true')

    await user.click(screen.getByRole('checkbox', { name: /Busca/ }))
    await user.click(clima)
    await user.click(clima)
    expect(save()).not.toHaveAttribute('aria-disabled')
    await user.click(save())
    const dialog = await reviewDialog()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    expect(dialog).toHaveTextContent('Só as diferenças; 1 igual nos dois.')
    expect(dialog).not.toHaveTextContent('ordem')
  })

  it('rag_config sem estratégia, sem provedor oferecido: aberto sem tocar não acende', async () => {
    server.use(
      http.get(SCHEMA_URL, () =>
        HttpResponse.json({
          success: true,
          data: { ...schemaFixture, embedderProviders: [{ name: 'fake-embed', modelParams: [], requiresBaseUrl: false }] }
        })
      )
    )
    serve('agents', [], {
      ...agent,
      rag_config: { active: true, doc_name: 'catalogo', model: 'e' }
    })
    await open('agents')

    expect(save()).toHaveAttribute('aria-disabled', 'true')
  })

  it('RAG ligado depois: provedor e estratégia aparecem como linhas com "Antes" vazio, nunca o padrão', async () => {
    serve('agents')
    const user = await open('agents')
    const card = within(screen.getByRole('region', { name: 'Configuração RAG' }))

    await user.click(card.getByRole('switch', { name: 'Habilitar RAG' }))
    await user.type(card.getByRole('textbox', { name: 'Nome do documento *' }), 'catalogo')
    await user.type(card.getByRole('textbox', { name: 'Modelo de embedding *' }), 'e')
    await user.click(save())

    const dialog = await reviewDialog()
    const rows = within(dialog).getAllByRole('listitem')
    const row = (label: string) => rows.find((item) => within(item).queryByText(label))
    for (const [label, value] of [
      ['Estratégia de busca', 'semantic'],
      ['Provedor de embedding', 'openai']
    ]) {
      const found = row(label)
      expect(found).toBeDefined()
      expect(within(found as HTMLElement).getByText('Antes').nextElementSibling).toHaveTextContent('vazio')
      expect(within(found as HTMLElement).getByText('Depois').nextElementSibling).toHaveTextContent(value)
    }
  })

  it('o PUT leva o mesmo data listado: mudar só um parâmetro mostra só a chave', async () => {
    const sent = serve('agents', [], { ...agent, model_params: { temperature: 0.2, top_p: 1 } })
    const user = await open('agents')

    const value = screen.getByDisplayValue('0.2')
    await user.clear(value)
    await user.type(value, '0.7')
    await user.click(save())
    const dialog = await reviewDialog()
    const rows = within(dialog).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('temperature')
    await user.click(confirm(dialog))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].body.model_params).toEqual({ temperature: 0.7, top_p: 1 })
  })
})

describe('Segredos nunca no diálogo (V-7)', () => {
  it('agent: api_key_ref legada fora da regra fica mascarada nos dois lados, com a ajuda', async () => {
    const legacy = 'sk-legado-colado-1234567890'
    serve('agents', [], { ...agent, api_key_ref: legacy })
    const user = await open('agents')
    await paste(user, screen.getByDisplayValue(legacy), 'env:OPENAI_API_KEY')

    await user.click(save())
    const dialog = await reviewDialog()

    expect(dialog.textContent).not.toContain(legacy)
    expect(dialog.innerHTML).not.toContain(legacy)
    expect(dialog).toHaveTextContent('••••••')
    expect(dialog).toHaveTextContent('Valores em texto não são exibidos.')
  })

  it('team: api_key_ref legada fica mascarada', async () => {
    const legacy = 'sk-team-legado-1234567890'
    serve('teams', [], { ...team, api_key_ref: legacy })
    const user = await open('teams')
    await paste(user, screen.getByDisplayValue(legacy), 'env:OPENAI_API_KEY')

    await user.click(save())
    const dialog = await reviewDialog()

    expect(dialog.innerHTML).not.toContain(legacy)
    expect(dialog).toHaveTextContent('••••••')
  })

  it('tool: header em texto digitado nunca aparece; referência e *** como estão', async () => {
    const typed = 'valor-digitado-secreto'
    serve('tools', [], { ...tool, headers: { 'X-Api-Key': '***', 'X-Texto': 'antigo-secreto' } })
    const user = await open('tools')
    await paste(user, screen.getByRole('textbox', { name: 'Valor de X-Texto' }), typed)

    await user.click(save())
    const dialog = await reviewDialog()

    expect(dialog.innerHTML).not.toMatch(/valor-digitado-secreto|antigo-secreto/)
    expect(dialog).toHaveTextContent('X-Texto')
    expect(dialog).toHaveTextContent('••••••')
    expect(dialog).toHaveTextContent('Valores em texto não são exibidos.')
    expect(within(dialog).queryByText('X-Api-Key')).not.toBeInTheDocument()
  })

  it('conflito: api_key_ref fora da regra também fica mascarada', async () => {
    const legacy = 'sk-conflito-legado-123456'
    const sent = serve(
      'agents',
      [() => HttpResponse.json({ success: false, error: 'version_conflict' }, { status: 412 })],
      agent,
      [{ ...agent, api_key_ref: legacy, version: 7 }]
    )
    const user = await open('agents')
    await rename(user)

    await saveAndConfirm(user)

    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    expect(dialog.innerHTML).not.toContain(legacy)
    expect(dialog).toHaveTextContent('••••••')
    expect(sent).toHaveLength(1)
  })
})

// R12 da revisão: só a edição desfeita limpa os erros. Com o default inválido o
// Salvar segue ativo sem mudança, e a validação do clique precisa aparecer.
describe('Validação com o Salvar ativo sem mudança (tool)', () => {
  const invalid = { name: 'p', type: 'integer', description: 'P', required: false, default_value: 'dez' }
  const DESCRIPTION_REQUIRED = 'Descrição é obrigatória'

  it('default inválido já gravado, sem edição: Salvar ativo sem dica; o clique leva o foco ao valor, sem diálogo nem request', async () => {
    const sent = serve('tools', [], { ...tool, route: 'https://clima.example.com/v1', parameters: [invalid] })
    const user = await open('tools')

    expect(save()).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()

    await user.click(save())

    await waitFor(() => expect(screen.getByLabelText('Valor padrão')).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it('default inválido gravado + descrição vazia gravada: o erro da descrição aparece e leva o foco', async () => {
    const sent = serve('tools', [], { ...tool, description: '', parameters: [invalid] })
    const user = await open('tools')

    await user.click(save())

    expect(await screen.findByText(DESCRIPTION_REQUIRED)).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByLabelText(/^Descrição/)[0]).toHaveFocus())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getByText(DESCRIPTION_REQUIRED)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })

  it('default inválido digitado + parâmetro de descrição vazia gravado: o erro do parâmetro aparece', async () => {
    const sent = serve('tools', [], {
      ...tool,
      route: 'https://clima.example.com/v1',
      parameters: [{ name: 'p', type: 'integer', description: '', required: false }]
    })
    const user = await open('tools')
    await paste(user, screen.getByLabelText('Valor padrão'), 'dez')

    await user.click(save())

    expect(await screen.findByText(DESCRIPTION_REQUIRED)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getByText(DESCRIPTION_REQUIRED)).toBeInTheDocument()
    expect(sent).toEqual([])
  })
})

// R2 da revisão: sem mudança não há o que salvar, então o erro do último envio
// não pode ficar na tela junto de "Nenhuma alteração para salvar.".
describe('Erro do orquestrador e a edição desfeita', () => {
  const rejected = (field: string) => () =>
    HttpResponse.json({ success: false, error: 'invalid_config', field }, { status: 422 })
  const REJECTED = 'Valor recusado pelo orquestrador'

  it('agent: 422 em model_params, valor revertido: o erro sai e a dica fica', async () => {
    serve('agents', [rejected('model_params')], { ...agent, model_params: { temperature: 0.2 } })
    const user = await open('agents')
    const value = screen.getByDisplayValue('0.2')
    await user.clear(value)
    await user.type(value, '0.7')

    await saveAndConfirm(user)
    expect(await screen.findByText(REJECTED)).toBeInTheDocument()

    await user.clear(value)
    await user.type(value, '0.2')

    expect(screen.getByText(HINT)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(REJECTED)).not.toBeInTheDocument())
  })

  it('team: 422 em model_params, valor revertido: o erro sai e a dica fica', async () => {
    serve('teams', [rejected('model_params')], { ...team, model_params: { temperature: 0.2 } })
    const user = await open('teams')
    const value = screen.getByDisplayValue('0.2')
    await user.clear(value)
    await user.type(value, '0.7')

    await saveAndConfirm(user)
    expect(await screen.findByText(REJECTED)).toBeInTheDocument()

    await user.clear(value)
    await user.type(value, '0.2')

    expect(screen.getByText(HINT)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(REJECTED)).not.toBeInTheDocument())
  })

  it('tool: 422 em headers, valor revertido: o erro sai e a dica fica', async () => {
    serve('tools', [rejected('headers')], { ...tool, headers: { 'X-Conta': 'conta' } })
    const user = await open('tools')
    await user.type(screen.getByRole('textbox', { name: 'Valor de X-Conta' }), 'X')

    await saveAndConfirm(user)
    expect(await screen.findByText(/O orquestrador recusou algum header/)).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Valor de X-Conta' }), '{Backspace}')

    expect(screen.getByText(HINT)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/O orquestrador recusou algum header/)).not.toBeInTheDocument())
  })

  it('agent: 422 no provedor (Select sem revalidação), valor revertido: o erro sai e a dica fica', async () => {
    serve('agents', [rejected('factoryIaModel')])
    const user = await open('agents')
    const provider = screen.getByRole('combobox', { name: /^Provedor \*/ })
    await user.click(provider)
    await user.click(screen.getByRole('option', { name: 'ollama' }))

    await saveAndConfirm(user)
    expect(await screen.findByText(REJECTED)).toBeInTheDocument()

    await user.click(provider)
    await user.click(screen.getByRole('option', { name: 'openai' }))

    expect(screen.getByText(HINT)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(REJECTED)).not.toBeInTheDocument())
  })

  it('agent: RAG desligado, 422 em rag_api_key_ref, edição revertida: a nota sai com o erro e os campos ficam abertos', async () => {
    const ragOff = { active: false, doc_name: 'catalogo', model: 'e', factoryIaModel: 'openai', api_key_ref: 'env:EMBED_API_KEY' }
    serve('agents', [rejected('rag_api_key_ref')], { ...agent, rag_config: ragOff })
    const user = await open('agents')
    const NOTE = 'RAG desligado, com campos mostrados porque um deles tem erro. Os valores continuam guardados.'
    const name = nameField()
    await user.type(name, 'x')

    await saveAndConfirm(user)
    expect(await screen.findByText(REJECTED)).toBeInTheDocument()
    expect(screen.getByText(NOTE)).toBeInTheDocument()

    await user.type(name, '{Backspace}')

    expect(screen.getByText(HINT)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(REJECTED)).not.toBeInTheDocument())
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nome do documento *' })).toBeVisible()
  })

  it('com a edição ainda na tela, o erro fica', async () => {
    serve('agents', [rejected('model_params')], { ...agent, model_params: { temperature: 0.2 } })
    const user = await open('agents')
    const value = screen.getByDisplayValue('0.2')
    await user.clear(value)
    await user.type(value, '0.7')

    await saveAndConfirm(user)
    expect(await screen.findByText(REJECTED)).toBeInTheDocument()

    await user.type(value, '5')
    expect(screen.getByText(REJECTED)).toBeInTheDocument()
  })
})

// D-P4-02-6: a resposta do 200 pode diferir do enviado (o BFF apara, o orquestrador
// preenche defaults): o formulário passa a ser ela, sem perder status nem foco.
describe('Depois do 200 o formulário é o documento salvo', () => {
  const saved = (doc: object) => () => HttpResponse.json({ success: true, data: doc, runtimeRevision: 12 })

  it('agent: nome, parâmetros, tools e execução ausente vêm do documento; status e foco ficam', async () => {
    serve(
      'agents',
      [saved({ ...agent, nome: 'Aparado', model_params: { temperature: 0.9 }, tools_ids: ['busca'], version: 6 })],
      { ...agent, model_params: { temperature: 0.2 } }
    )
    const user = await open('agents')
    await screen.findByRole('checkbox', { name: /Clima/ })
    await rename(user, ' Aparado ')

    await saveAndConfirm(user)

    expect(await screen.findByText('Agente salvo.')).toBeInTheDocument()
    await waitFor(() => expect(nameField()).toHaveValue('Aparado'))
    expect(screen.getByRole('textbox', { name: 'Valor de temperature' })).toHaveValue('0.9')
    expect(screen.getByRole('checkbox', { name: /Busca/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Clima/ })).not.toBeChecked()
    // Ausente no documento: o default do schema, como ao abrir.
    expect(screen.getByRole('switch', { name: 'Responder em Markdown' })).toBeChecked()
    await waitFor(() => expect(save()).toHaveAttribute('aria-disabled', 'true'))
    await waitFor(() => expect(save()).toHaveFocus())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getByText('Agente salvo.')).toBeInTheDocument()
    expect(save()).toHaveFocus()
  })

  it('agent: RAG desligado com os campos reabertos pelo 422: ficam abertos depois do 200, sem a nota nem o erro', async () => {
    const ragOff = { active: false, doc_name: 'catalogo', model: 'e', factoryIaModel: 'openai', search_strategy: 'semantic' }
    const doc = { ...agent, rag_config: ragOff }
    serve(
      'agents',
      [
        () => HttpResponse.json({ success: false, error: 'invalid_config', field: 'rag_doc_name' }, { status: 422 }),
        saved({ ...doc, nome: 'Assistentex', version: 6 })
      ],
      doc
    )
    const user = await open('agents')
    await user.type(nameField(), 'x')

    await saveAndConfirm(user)
    expect(await screen.findByText('Valor recusado pelo orquestrador')).toBeInTheDocument()
    const docName = screen.getByRole('textbox', { name: 'Nome do documento *' })
    expect(docName).toBeVisible()

    await saveAndConfirm(user)

    expect(await screen.findByText('Agente salvo.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nome do documento *' })).toHaveValue('catalogo')
    expect(screen.getByRole('textbox', { name: 'Nome do documento *' })).toBeVisible()
    expect(screen.queryByText('Valor recusado pelo orquestrador')).not.toBeInTheDocument()
    expect(screen.queryByText(/com campos mostrados/)).not.toBeInTheDocument()
    await waitFor(() => expect(save()).toHaveAttribute('aria-disabled', 'true'))
  })

  it('team: os membros vêm do documento; status e foco ficam', async () => {
    serve('teams', [saved({ ...team, nome: 'Novo', member_ids: ['outro'], version: 4 })])
    const user = await open('teams')
    await rename(user, 'Novo')

    await saveAndConfirm(user)

    expect(await screen.findByText('Team salvo.')).toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: /Outro/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Assistente/ })).not.toBeChecked()
    await waitFor(() => expect(save()).toHaveAttribute('aria-disabled', 'true'))
    await waitFor(() => expect(save()).toHaveFocus())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getByText('Team salvo.')).toBeInTheDocument()
  })
})

describe('Espaço nas pontas (B1)', () => {
  it.each(KIND_NAMES)('%s: só um espaço no fim do nome não acende; o diálogo mostra o nome aparado', async (kind) => {
    serve(kind)
    const user = await open(kind)

    await user.type(nameField(), ' ')
    expect(save()).toHaveAttribute('aria-disabled', 'true')

    await rename(user, 'Novo nome ')
    await user.click(save())
    const dialog = await reviewDialog()
    expect(within(dialog).getByText('Depois').nextElementSibling?.textContent).toBe('Novo nome')
  })

  it('agent: espaço no prompt acende (o BFF não apara)', async () => {
    serve('agents')
    const user = await open('agents')

    await user.type(screen.getByLabelText('Prompt do sistema'), ' ')

    expect(save()).not.toHaveAttribute('aria-disabled')
  })
})

describe('Texto longo (D-P4-02-3)', () => {
  const lines = Array.from({ length: 12 }, (_, line) => `linha ${line}`)

  it('V-8: recolhido mostra a janela e "… N linhas iguais acima" nas duas caixas; Mostrar tudo abre o texto sem o marcador', async () => {
    serve('agents', [], { ...agent, prompt: lines.join('\n') })
    const user = await open('agents')
    const edited = [...lines]
    edited[7] = 'linha editada'

    fireEvent.change(screen.getByLabelText('Prompt do sistema'), { target: { value: edited.join('\n') } })
    await user.click(save())
    const dialog = await reviewDialog()

    expect(within(dialog).getAllByText('… 6 linhas iguais acima')).toHaveLength(2)
    expect(dialog).toHaveTextContent('linha editada')
    expect(dialog).not.toHaveTextContent('linha 0')
    expect(dialog).not.toHaveTextContent('linha 10')

    const more = within(dialog).getByRole('button', { name: 'Mostrar tudo' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)

    expect(within(dialog).queryByText('… 6 linhas iguais acima')).not.toBeInTheDocument()
    expect(dialog).toHaveTextContent('linha 0')
    expect(dialog).toHaveTextContent('linha 11')
    expect(within(dialog).getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('D-P4-02-5: linha única longa com a mudança no fim: "…" nas duas caixas e Mostrar tudo abre o texto inteiro', async () => {
    const seed =
      'You are an expert programming assistant. You help developers with code review, debugging, writing clean code, explaining complex programming concepts, and providing best practices. You are knowledgeable in multiple programming languages and frameworks.'
    serve('agents', [], { ...agent, prompt: seed })
    const user = await open('agents')

    fireEvent.change(screen.getByLabelText('Prompt do sistema'), {
      target: { value: seed.replace('frameworks.', 'EDITADO.') }
    })
    await user.click(save())
    const dialog = await reviewDialog()

    expect(within(dialog).getByText('Antes').nextElementSibling?.textContent).toMatch(/^….*frameworks\.$/)
    expect(within(dialog).getByText('Depois').nextElementSibling?.textContent).toMatch(/^….*EDITADO\.$/)
    expect(dialog).not.toHaveTextContent('You are an expert')

    await user.click(within(dialog).getByRole('button', { name: 'Mostrar tudo' }))

    expect(within(dialog).getByText('Antes').nextElementSibling).toHaveTextContent(seed)
    expect(within(dialog).getByText('Depois').nextElementSibling?.textContent).toMatch(/^You are an expert/)
  })

  it('no conflito 412 a mesma janela, nas colunas do conflito', async () => {
    const newer = [...lines]
    newer[9] = 'linha de outra pessoa'
    serve(
      'agents',
      [() => HttpResponse.json({ success: false, error: 'version_conflict' }, { status: 412 })],
      { ...agent, prompt: lines.join('\n') },
      [{ ...agent, prompt: newer.join('\n'), version: 7 }]
    )
    const user = await open('agents')
    await rename(user)

    await saveAndConfirm(user)

    const dialog = await screen.findByRole('dialog', { name: 'O agente mudou' })
    await within(dialog).findByRole('region', { name: 'Campos que diferem' })
    expect(within(dialog).getAllByText('… 8 linhas iguais acima')).toHaveLength(2)
    expect(within(dialog).getAllByText('O seu valor').length).toBeGreaterThan(0)
    expect(dialog).toHaveTextContent('linha de outra pessoa')
  })
})

describe.each(['agents', 'teams'] as const)('Desempenho (V-21, %s)', (kind) => {
  it('digitar num prompt de 100 KB só re-renderiza quando o Salvar vira', async () => {
    const big = 'linha do prompt grande para medir\n'.repeat(3100)
    expect(big.length).toBeGreaterThan(100_000)
    const { Editor, entity, id } = KINDS[kind]
    serve(kind, [], { ...entity, prompt: big })
    let commits = 0
    const user = userEvent.setup()
    renderWithIntl(
      <Profiler id="editor" onRender={() => commits++}>
        <Editor id={id} />
      </Profiler>
    )
    await waitFor(() => expect(save()).toBeEnabled())
    const prompt = screen.getByRole('textbox', { name: /prompt/i }) as HTMLTextAreaElement
    prompt.focus()
    // A 1ª tecla vira o booleano: um render. As seguintes, nenhum.
    await user.keyboard('a')
    expect(save()).not.toHaveAttribute('aria-disabled')
    await waitFor(() => expect(screen.queryByText(HINT)).not.toBeInTheDocument())
    const after = commits

    await user.keyboard('bcdefghijklmnopqrst')

    expect(prompt.value.endsWith('abcdefghijklmnopqrst')).toBe(true)
    expect(commits).toBe(after)
  }, 30_000)
})
