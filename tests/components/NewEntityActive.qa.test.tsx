import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import { TeamForm } from '@/components/management/teams/TeamForm'
import { ToolForm } from '@/components/management/tools/ToolForm'

import { renderWithIntl } from '../helpers/intl'
import { server } from '../msw/server'
import { captureSave, stubBrowserApis } from '../helpers/toolForm'

// QA P3-06: "sem o switch Ativo nos formulários, e entidade nova criada
// ativa". O dev cobriu o switch ausente no editor existente; aqui o /new dos
// três kinds: nenhum switch de estado e o POST leva active true.

beforeAll(stubBrowserApis)

function capture(kind: 'agents' | 'teams' | 'tools') {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post(`*/api/${kind}`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ success: true, data: {} })
    })
  )
  return bodies
}

const noStateSwitch = () =>
  expect(screen.queryByRole('switch', { name: /ativ[oa]$/i })).not.toBeInTheDocument()

describe('entidade nova nasce ativa, sem switch', () => {
  it('agent', async () => {
    const bodies = capture('agents')
    server.use(
      http.get('*/api/tools', () =>
        HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })
      )
    )
    const user = userEvent.setup()
    renderWithIntl(<AgentForm onSuccess={() => {}} />)
    noStateSwitch()

    await user.type(screen.getByLabelText(/ID do agente/), 'novo-agent')
    await user.type(screen.getByLabelText('Nome *'), 'Novo')
    await user.type(screen.getByLabelText(/^Modelo \*/), 'llama3.2')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ id: 'novo-agent', active: true })
  })

  it('tool', async () => {
    const bodies = captureSave('post')
    const user = userEvent.setup()
    renderWithIntl(<ToolForm onSuccess={() => {}} />)
    noStateSwitch()

    await user.type(screen.getByLabelText(/ID da tool/), 'nova-tool')
    await user.type(screen.getByLabelText(/^Nome/), 'Nova')
    await user.type(screen.getByLabelText(/^Descrição/), 'Descrição')
    await user.type(screen.getByLabelText(/^Rota/), 'https://clima.example.com/v1')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ id: 'nova-tool', active: true })
  })

  it('team', async () => {
    const bodies = capture('teams')
    server.use(
      http.get('*/api/agents', () =>
        HttpResponse.json({
          success: true,
          data: {
            data: [
              {
                id: 'membro',
                nome: 'Membro',
                descricao: 'd',
                prompt: '',
                active: true,
                tools_ids: [],
                factoryIaModel: 'openai',
                model: 'gpt-4o',
                version: 1
              }
            ],
            total: 1,
            page: 1,
            limit: 100,
            totalPages: 1
          }
        })
      )
    )
    const user = userEvent.setup()
    renderWithIntl(<TeamForm onSuccess={() => {}} />)
    noStateSwitch()

    await user.click(await screen.findByRole('checkbox', { name: /Membro/ }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled())
    await user.type(screen.getByLabelText(/^ID do team/), 'novo-team')
    await user.type(screen.getByLabelText(/^Nome/), 'Novo')
    await user.type(screen.getByRole('textbox', { name: /^Modelo \*/ }), 'gpt-4o')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ id: 'novo-team', active: true, member_ids: ['membro'] })
  })
})
