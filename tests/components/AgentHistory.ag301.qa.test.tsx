import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'
import { AgentEditor } from '@/components/management/agents/AgentEditor'

import { renderWithIntl } from '../helpers/intl'
import { stubBrowserApis } from '../helpers/toolForm'
import { RUNTIME_URL, runtimeBody } from '../msw/handlers'
import { server } from '../msw/server'

// QA do AG3-01: o histórico de versões (P4-04) mostra a linha "Expor raciocínio"
// com Antes x Depois, e um documento antigo sem o campo não gera linha falsa.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (href: string) => href }) }))
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
  reasoning: true,
  expose_reasoning: false,
  version: 8
}
const at = (version: number, patch: object = {}) => ({ ...agent, ...patch, version })
const entry = (version: number, document: object, previous: object) => ({
  version,
  actor: 'admin',
  at: AT,
  document,
  previous
})
// Documento antigo: sem o campo `expose_reasoning`.
const legacy: Partial<typeof agent> = { ...agent }
delete legacy.expose_reasoning

const HISTORY = [
  entry(8, agent, at(8, { expose_reasoning: true })),
  entry(7, { ...legacy, version: 7, prompt: 'Novo.' }, { ...legacy, version: 7, prompt: 'Velho.' })
]

describe('QA AG3-01: histórico de versões', () => {
  it('mostra "Expor raciocínio" com Antes x Depois; documento antigo sem o campo não gera a linha', async () => {
    server.use(
      http.get(RUNTIME_URL, () => HttpResponse.json(runtimeBody(7))),
      http.get('*/api/tools', () =>
        HttpResponse.json({ success: true, data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 } })
      ),
      http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: agent })),
      http.get('*/api/agents/:id/history', () =>
        HttpResponse.json({ success: true, data: { items: HISTORY, total: 2, offset: 0, limit: 20 } })
      )
    )
    const user = userEvent.setup()
    renderWithIntl(
      <RuntimeRevisionProvider>
        <AgentEditor id={agent.id} />
      </RuntimeRevisionProvider>
    )
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Histórico' }))
    await screen.findByRole('list', { name: 'Versões' })
    const sheet = screen.getByRole('dialog', { name: 'Histórico de versões' })
    const row = (version: number) =>
      within(within(sheet).getByRole('list', { name: 'Versões' }))
        .getAllByRole('listitem')
        .find((item) => item.textContent?.startsWith(`v${version}`))!

    await user.click(within(row(8)).getByRole('button', { name: 'Ver alterações' }))
    const diff = within(row(8)).getByRole('region', { name: 'Campos alterados na v8' })
    const line = within(diff).getByText('Expor raciocínio').closest('li')!
    expect(within(line).getAllByRole('term').map((term) => term.textContent)).toEqual(['Antes', 'Depois'])
    expect(within(line).getAllByRole('definition').map((cell) => cell.textContent)).toEqual(['Ligado', 'Desligado'])

    await user.click(within(row(7)).getByRole('button', { name: 'Ver alterações' }))
    const legacyDiff = within(row(7)).getByRole('region', { name: 'Campos alterados na v7' })
    expect(within(legacyDiff).getByText('Instruções do sistema')).toBeVisible()
    expect(within(legacyDiff).queryByText('Expor raciocínio')).not.toBeInTheDocument()
  })
})
