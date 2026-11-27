import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import { TeamForm } from '@/components/management/teams/TeamForm'
import { ToolForm } from '@/components/management/tools/ToolForm'
import type { AgentConfig, TeamConfig } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { saveAndConfirm, touchName } from '../helpers/saveReview'
import { stubBrowserApis, tool } from '../helpers/toolForm'
import { server } from '../msw/server'

// QA1-06 (#14, D-QA1-06-2): o ID de agent, team e tool só é aceito na criação
// com `^[a-z0-9_-]+$`, com erro no campo e sem request; o id gravado fora do
// padrão segue salvável (o campo fica desabilitado na edição, sem a ajuda).

const INVALID = 'ID fora do padrão.'
const HELP = 'Letras minúsculas, números, - e _. Não muda depois de criado.'
const LEGACY = 'QA Agente #1'

beforeAll(stubBrowserApis)

const page = (data: object[] = []) =>
  HttpResponse.json({ success: true, data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 } })

// Todo request de escrita fica registrado; a resposta é o documento salvo.
let writes: { method: string; url: string }[]
beforeEach(() => {
  writes = []
  const record = async ({ request }: { request: Request }) => {
    writes.push({ method: request.method, url: new URL(request.url).pathname })
    return HttpResponse.json({ success: true, data: { ...(await request.json()), version: 9 } })
  }
  server.use(
    http.get('*/api/tools', () => page()),
    http.get('*/api/agents', () => page([{ id: 'membro', nome: 'Membro', active: true, version: 1 }])),
    http.post('*/api/:kind', record),
    http.put('*/api/:kind/:id', record)
  )
})

const agent: AgentConfig = {
  id: LEGACY,
  nome: 'Legado',
  model: 'm1',
  factoryIaModel: 'ollama',
  descricao: '',
  prompt: '',
  active: true,
  tools_ids: [],
  version: 3
}

const team: TeamConfig = {
  id: LEGACY,
  nome: 'Legado',
  descricao: '',
  prompt: '',
  active: true,
  member_ids: ['membro'],
  mode: 'route',
  factoryIaModel: 'ollama',
  model: 'm1',
  version: 3
}

const FORMS = [
  { kind: 'agent', label: /^ID do agente/, create: () => <AgentForm onSuccess={() => {}} /> },
  { kind: 'team', label: /^ID do team/, create: () => <TeamForm onSuccess={() => {}} /> },
  { kind: 'tool', label: /^ID da tool/, create: () => <ToolForm onSuccess={() => {}} /> }
]

const saveButton = () => screen.getByRole('button', { name: 'Salvar' })

describe.each(FORMS)('$kind novo: formato do ID', ({ label, create }) => {
  it(`"${LEGACY}": erro no campo, foco nele e nenhum request`, async () => {
    const user = userEvent.setup()
    renderWithIntl(create())
    await waitFor(() => expect(saveButton()).toBeEnabled())
    const id = screen.getByLabelText(label)

    await user.type(id, LEGACY)
    await user.click(saveButton())

    expect(await screen.findByText(INVALID)).toBeVisible()
    expect(id).toHaveAttribute('aria-invalid', 'true')
    expect(id).toHaveAccessibleDescription(`${HELP} ${INVALID}`)
    expect(id).toHaveFocus()
    expect(writes).toEqual([])
  })

  it('a ajuda descreve o campo; corrigir o ID tira o erro a cada tecla', async () => {
    const user = userEvent.setup()
    renderWithIntl(create())
    await waitFor(() => expect(saveButton()).toBeEnabled())
    const id = screen.getByLabelText(label)
    expect(id).toHaveAccessibleDescription(new RegExp(`^${HELP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`))

    await user.type(id, 'Novo')
    await user.click(saveButton())
    expect(await screen.findByText(INVALID)).toBeVisible()

    await user.clear(id)
    await user.type(id, 'novo_id-2')
    await waitFor(() => expect(screen.queryByText(INVALID)).not.toBeInTheDocument())
    expect(id).not.toHaveAttribute('aria-invalid')
  })

  it('vazio segue "ID é obrigatório", sem a regra do formato', async () => {
    const user = userEvent.setup()
    renderWithIntl(create())
    await waitFor(() => expect(saveButton()).toBeEnabled())

    await user.click(saveButton())

    expect(await screen.findByText('ID é obrigatório')).toBeVisible()
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument()
  })
})

describe('edição com id gravado fora do padrão', () => {
  it.each([
    { kind: 'agent', label: /^ID do agente/, url: '/api/agents/QA%20Agente%20%231', edit: () => <AgentForm agent={agent} onSuccess={() => {}} /> },
    { kind: 'team', label: /^ID do team/, url: '/api/teams/QA%20Agente%20%231', edit: () => <TeamForm team={team} onSuccess={() => {}} /> },
    {
      kind: 'tool',
      label: /^ID da tool/,
      url: '/api/tools/QA%20Agente%20%231',
      edit: () => <ToolForm tool={{ ...tool, id: LEGACY }} onSuccess={() => {}} />
    }
  ])('$kind: sem ajuda, sem erro, e o PUT sai', async ({ label, url, edit }) => {
    const user = userEvent.setup()
    renderWithIntl(edit())
    await waitFor(() => expect(saveButton()).toBeEnabled())
    const id = screen.getByLabelText(label)
    expect(id).toBeDisabled()
    expect(screen.queryByText(HELP)).not.toBeInTheDocument()

    await touchName(user)
    await saveAndConfirm(user)

    await waitFor(() => expect(writes).toEqual([{ method: 'PUT', url }]))
    expect(screen.queryByText(INVALID)).not.toBeInTheDocument()
  })
})
