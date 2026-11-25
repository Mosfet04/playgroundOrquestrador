import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import { TeamForm } from '@/components/management/teams/TeamForm'
import type { AgentConfig, TeamConfig } from '@/types/management'

import { renderWithIntl } from '../helpers/intl'
import { saveAndConfirm, touchName } from '../helpers/saveReview'
import { stubBrowserApis } from '../helpers/toolForm'
import { server } from '../msw/server'

// QA do QA1-06: o que o teste do dev não alcança. Edição (o "sujo" vem do
// `hasChanges`, que precisa enxergar o que fica fora do RHF), ID hostil,
// parâmetro numérico nos outros dois grupos (team, embedder) e o team gravado
// sem `user_memory_active` (desvio do item).

beforeAll(stubBrowserApis)

const agent: AgentConfig = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'm1',
  factoryIaModel: 'ollama',
  descricao: '',
  prompt: '',
  active: true,
  tools_ids: [],
  version: 3
}
const team: TeamConfig = {
  id: 'suporte',
  nome: 'Suporte',
  descricao: '',
  prompt: '',
  active: true,
  member_ids: ['membro'],
  mode: 'route',
  factoryIaModel: 'ollama',
  model: 'm1',
  version: 3
}

const list = (data: object[]) =>
  HttpResponse.json({ success: true, data: { data, total: data.length, page: 1, limit: 100, totalPages: 1 } })

let followed: string[]
const follow = (event: MouseEvent) => {
  const link = event.target instanceof Element ? event.target.closest('a') : null
  if (!link) return
  if (!event.defaultPrevented) followed.push(link.getAttribute('href') ?? '')
  event.preventDefault()
}
let writes: { method: string; body: Record<string, unknown> }[]
beforeEach(() => {
  followed = []
  writes = []
  window.addEventListener('click', follow)
  const record = (method: string) => async ({ request }: { request: Request }) => {
    const body = (await request.json()) as Record<string, unknown>
    writes.push({ method, body })
    return HttpResponse.json({ success: true, data: { ...body, version: 9 } })
  }
  server.use(
    http.get('*/api/tools', () => list([{ id: 'clima', name: 'Clima', description: 'd' }])),
    http.get('*/api/agents', () => list([{ id: 'membro', nome: 'Membro', active: true, version: 1 }])),
    http.post('*/api/:kind', record('POST')),
    http.put('*/api/:kind/:id', record('PUT'))
  )
})
afterEach(() => window.removeEventListener('click', follow))

const draftDialog = () => screen.queryByRole('dialog', { name: 'Descartar alterações?' })
const saveButton = () => screen.getByRole('button', { name: 'Salvar' })

async function open(element: React.ReactElement) {
  const user = userEvent.setup()
  renderWithIntl(element)
  await waitFor(() => expect(saveButton()).toBeEnabled())
  return user
}

describe('edição: o "sujo" enxerga o que fica fora do formulário', () => {
  it('agent: só marcar uma tool avisa; desmarcar de novo, não', async () => {
    const user = await open(<AgentForm agent={agent} onSuccess={() => {}} />)
    const clima = await screen.findByRole('checkbox', { name: /Clima/ })

    await user.click(clima)
    await user.click(screen.getByRole('link', { name: 'Voltar' }))
    expect(draftDialog()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(draftDialog()).not.toBeInTheDocument())

    await user.click(clima)
    await user.click(screen.getByRole('link', { name: 'Voltar' }))
    expect(draftDialog()).not.toBeInTheDocument()
    expect(followed).toEqual(['/agents'])
  })
})

describe('ID na criação: entrada hostil', () => {
  it.each(['açaí', ' agent', 'agent ', '../etc', 'a/b', 'AGENT'])('%j: erro e nenhum POST', async (id) => {
    const user = await open(<AgentForm onSuccess={() => {}} />)
    await user.type(screen.getByLabelText(/^ID do agente/), id)
    await user.type(screen.getByLabelText(/^Nome \*/), 'X')

    await user.click(saveButton())

    expect(await screen.findByText('ID fora do padrão.')).toBeVisible()
    expect(writes).toEqual([])
  })

  it.each(['-', '_', '0', 'a-b_c9'])('%j (fronteira válida) segue para o POST', async (id) => {
    const user = await open(<AgentForm onSuccess={() => {}} />)
    await user.type(screen.getByLabelText(/^ID do agente/), id)
    await user.type(screen.getByLabelText(/^Nome \*/), 'X')
    await user.type(screen.getByLabelText(/^Modelo \*/), 'm')

    await user.click(saveButton())

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body.id).toBe(id)
  })
})

describe('parâmetro numérico nos outros grupos', () => {
  it('team: temperature gravada como texto bloqueia o Salvar, com o erro na linha', async () => {
    const user = await open(<TeamForm team={{ ...team, model_params: { temperature: 'alta' } }} onSuccess={() => {}} />)
    await touchName(user)

    await user.click(saveButton())

    expect(await screen.findByText('temperature precisa ser um número (ex.: 0,7 ou 0.7).')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Revisar antes de salvar' })).not.toBeInTheDocument()
    expect(writes).toEqual([])
  })

  it('embedder (rag_params): temperature = abc bloqueia; 0,7 salva como 0.7', async () => {
    const withRag: AgentConfig = {
      ...agent,
      rag_config: {
        active: true,
        doc_name: 'catalogo',
        model: 'text-embedding-3-small',
        factoryIaModel: 'openai',
        search_strategy: 'hierarchical',
        model_params: { temperature: 'abc' }
      }
    }
    const user = await open(<AgentForm agent={withRag} onSuccess={() => {}} />)
    await touchName(user)

    await user.click(saveButton())

    const message = 'temperature precisa ser um número (ex.: 0,7 ou 0.7).'
    expect(await screen.findByText(message)).toBeVisible()
    expect(writes).toEqual([])

    const value = screen.getByRole('textbox', { name: 'Valor de temperature' })
    await user.clear(value)
    await user.type(value, '0,7')
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument())
    await saveAndConfirm(user)

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body.rag_model_params).toStrictEqual({ temperature: 0.7 })
  })
})

describe('memória do team gravado (desvio do item)', () => {
  it('team lido sem user_memory_active abre ligado e o PUT não muda o runtime', async () => {
    const user = await open(<TeamForm team={team} onSuccess={() => {}} />)
    expect(screen.getByRole('switch', { name: 'Memória do usuário' })).toBeChecked()

    await touchName(user)
    await saveAndConfirm(user)

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body.user_memory_active).toBe(true)
  })
})
