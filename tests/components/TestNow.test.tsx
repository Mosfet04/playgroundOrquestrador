import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { ApplyStatus } from '@/components/management/common/ApplyStatus'
import { TeamEditor } from '@/components/management/teams/TeamEditor'
import { ToolEditor } from '@/components/management/tools/ToolEditor'

import { renderWithIntl } from '../helpers/intl'
import { saveAndConfirm, touchName } from '../helpers/saveReview'
import { stubBrowserApis } from '../helpers/toolForm'
import { server } from '../msw/server'

// P4-03 (spec docs/design/P4-03.md): "Testar agora" no status "aplicada" do
// editor de agent e de team, um link para /playground?agent=<id> ou ?team=<id>
// (mesma aba, sem session). Ausente na entidade inativa, no não aplicada, no
// não confirmada e na tool.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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
  agents: { Editor: AgentEditor, entity: agent, param: 'agent' },
  teams: { Editor: TeamEditor, entity: team, param: 'team' },
  tools: { Editor: ToolEditor, entity: tool, param: null }
} as const

const page = (data: object[]) => ({ success: true, data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 } })

async function saveEntity(
  kind: keyof typeof KINDS,
  entity: object,
  write: () => Response = () => HttpResponse.json({ success: true, data: { ...entity, version: 4 }, runtimeRevision: 8 })
) {
  server.use(
    http.get('*/api/tools', () => HttpResponse.json(page([]))),
    http.get('*/api/agents', () => HttpResponse.json(page([agent]))),
    http.get(`*/api/${kind}/:id`, () => HttpResponse.json({ success: true, data: entity })),
    http.put(`*/api/${kind}/:id`, write)
  )
  const user = userEvent.setup()
  const { Editor } = KINDS[kind]
  renderWithIntl(<Editor id={(entity as { id: string }).id} />)
  const save = await screen.findByRole('button', { name: 'Salvar' })
  await waitFor(() => expect(save).toBeEnabled())
  await touchName(user)
  await saveAndConfirm(user)
  return user
}

const region = () => document.querySelector<HTMLElement>('[aria-live="polite"][aria-atomic="true"]')!
const testNow = () => within(region()).queryByRole('link', { name: /^Testar agora/ })

describe('ApplyStatus: ação "Testar agora"', () => {
  it('agent aplicado: link para ?agent=<id> com o id codificado, sem session, na mesma aba', () => {
    renderWithIntl(<ApplyStatus kind="agents" result={{ status: 'applied', revision: 8 }} testNowId="a b/ç" />)

    const link = screen.getByRole('link', { name: 'Testar agora no playground' })
    expect(link).toHaveAttribute('href', '/playground?agent=a%20b%2F%C3%A7')
    expect(link).not.toHaveAttribute('target')
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('team aplicado: link para ?team=<id>', () => {
    renderWithIntl(<ApplyStatus kind="teams" result={{ status: 'applied' }} testNowId="suporte" />)

    expect(screen.getByRole('link', { name: 'Testar agora no playground' })).toHaveAttribute(
      'href',
      '/playground?team=suporte'
    )
  })

  it('em inglês: "Test now in the playground"', () => {
    renderWithIntl(<ApplyStatus kind="agents" result={{ status: 'applied' }} testNowId="a" />, { locale: 'en' })

    expect(screen.getByRole('link', { name: 'Test now in the playground' })).toBeInTheDocument()
  })

  it.each([
    ['sem entidade (criação, inativa, tool)', { status: 'applied' } as const, undefined],
    ['não aplicada', { status: 'not_applied' } as const, 'a'],
    ['não confirmada', { status: 'not_confirmed' } as const, 'a']
  ])('%s: sem a ação', (_name, result, testNowId) => {
    renderWithIntl(<ApplyStatus kind="agents" result={result} testNowId={testNowId} onReload={() => undefined} />)

    expect(screen.queryByRole('link', { name: /Testar agora/ })).not.toBeInTheDocument()
  })
})

describe.each(['agents', 'teams'] as const)('%s: editor depois de salvar', (kind) => {
  const { entity, param } = KINDS[kind]

  it('aplicada: "Testar agora" leva ao playground da entidade, sem session', async () => {
    await saveEntity(kind, entity)

    const link = await within(region()).findByRole('link', { name: 'Testar agora no playground' })
    expect(link).toHaveAttribute('href', `/playground?${param}=${entity.id}`)
  })

  it('entidade inativa: aplicada, mas sem a ação', async () => {
    await saveEntity(kind, { ...entity, active: false })

    await within(region()).findByText(/Mudança aplicada/)
    expect(testNow()).not.toBeInTheDocument()
  })

  it('não aplicada: sem a ação', async () => {
    await saveEntity(kind, entity, () =>
      HttpResponse.json({ success: false, error: 'not_applied' }, { status: 422 })
    )

    await within(region()).findByText(/^Não aplicada/)
    expect(testNow()).not.toBeInTheDocument()
  })

  it('não confirmada: sem a ação', async () => {
    await saveEntity(kind, entity, () =>
      HttpResponse.json({ success: false, error: 'not_confirmed' }, { status: 502 })
    )

    await within(region()).findByText(/^Não confirmada/)
    expect(testNow()).not.toBeInTheDocument()
  })

  it('editar depois do Salvar: o status some e a ação junto', async () => {
    const user = await saveEntity(kind, entity)
    await within(region()).findByRole('link', { name: 'Testar agora no playground' })

    await user.type(screen.getByLabelText(/^Nome/), 'x')

    expect(region()).toBeEmptyDOMElement()
  })
})

describe('tool: editor depois de salvar', () => {
  it('aplicada, mas sem "Testar agora"', async () => {
    await saveEntity('tools', tool)

    await within(region()).findByText(/Mudança aplicada/)
    expect(testNow()).not.toBeInTheDocument()
  })
})
