import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import { ToolForm } from '@/components/management/tools/ToolForm'
import type { AgentConfig, Tool } from '@/types/management'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P2-06 (D-P2-06-7, D-P2-06-8): o editor reenvia a versão lida no If-Match e
// o 422 do orquestrador aparece no campo que ele recusou, com texto fixo do
// catálogo (nunca o valor). Campo fora do form ou 422 sem campo: só o toast.

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

const REJECTED = 'Valor recusado pelo orquestrador'

const agent: AgentConfig = {
  id: 'assistente',
  nome: 'Assistente',
  model: 'gpt-4o',
  factoryIaModel: 'openai',
  descricao: '',
  prompt: '',
  active: true,
  tools_ids: [],
  version: 3
}

const tool: Tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão do tempo',
  route: 'https://clima.example.com/v1',
  http_method: 'GET',
  parameters: [{ name: 'cidade', type: 'string', description: 'Cidade', required: true }],
  instructions: '',
  headers: { 'X-Api-Key': '***' },
  active: true,
  version: 7
}

const noTools = http.get('*/api/tools', () =>
  HttpResponse.json({
    success: true,
    data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
  })
)

type Saved = { ifMatch: string | null; body: Record<string, unknown> }

// PUT do editor: responde na ordem dada (um por envio).
function serveSaves(path: string, responses: Response[]) {
  const saved: Saved[] = []
  server.use(
    http.put(path, async ({ request }) => {
      saved.push({
        ifMatch: request.headers.get('if-match'),
        body: (await request.json()) as Record<string, unknown>
      })
      return responses[saved.length - 1] ?? HttpResponse.json({ success: true, data: {} })
    })
  )
  return saved
}

const refused = (field?: string) =>
  HttpResponse.json(
    { success: false, error: 'invalid_config', ...(field ? { field } : {}) },
    { status: 422 }
  )

// Bloco do campo (rótulo + controle + erro) e cartão de uma seção.
const block = (label: RegExp) => screen.getByText(label).closest('.space-y-2, .space-y-4') as HTMLElement
const card = (title: RegExp) => screen.getByText(title).closest('.rounded-lg') as HTMLElement

function renderAgent(onSuccess = () => {}) {
  renderWithIntl(
    <>
      <AgentForm agent={agent} onSuccess={onSuccess} />
      <Toaster />
    </>
  )
}

describe('AgentForm: If-Match e 422 no campo', () => {
  it('PUT leva a versão lida; o 422 em factoryIaModel aparece no Provedor e o toast tem o código', async () => {
    server.use(noTools)
    const saved = serveSaves('*/api/agents/:id', [refused('factoryIaModel')])
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderAgent(onSuccess)

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Não foi possível salvar o agente (código 422)')).toBeInTheDocument()
    expect(within(block(/^Provedor \*/)).getByText(REJECTED)).toBeInTheDocument()
    expect(screen.getAllByText(REJECTED)).toHaveLength(1)
    expect(saved[0].ifMatch).toBe('"3"')
    expect(saved[0].body).not.toHaveProperty('version')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('o erro do servidor num campo sem regra não trava o próximo envio', async () => {
    server.use(noTools)
    const saved = serveSaves('*/api/agents/:id', [
      refused('tools_ids'),
      HttpResponse.json({ success: true, data: agent })
    ])
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderAgent(onSuccess)

    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await within(card(/^Tools disponíveis/)).findByText(REJECTED)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(saved).toHaveLength(2)
    expect(screen.queryByText(REJECTED)).not.toBeInTheDocument()
  })

  it.each([
    ['sem campo', undefined],
    ['campo fora do formulário', 'rag_config.search_strategy']
  ])('422 %s: só o toast com o código', async (_, field) => {
    server.use(noTools)
    serveSaves('*/api/agents/:id', [refused(field)])
    const user = userEvent.setup()
    renderAgent()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Não foi possível salvar o agente (código 422)')).toBeInTheDocument()
    expect(screen.queryByText(REJECTED)).not.toBeInTheDocument()
  })
})

describe('ToolForm: header mascarado, If-Match e 422 no campo', () => {
  function renderTool() {
    renderWithIntl(
      <>
        <ToolForm tool={tool} onSuccess={() => {}} />
        <Toaster />
      </>
    )
  }

  it('mostra o header mascarado e salvar sem mexer reenvia a máscara com a versão', async () => {
    const saved = serveSaves('*/api/tools/:id', [HttpResponse.json({ success: true, data: tool })])
    const user = userEvent.setup()
    renderTool()

    expect(screen.getByDisplayValue('***')).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].ifMatch).toBe('"7"')
    expect(saved[0].body.headers).toEqual({ 'X-Api-Key': '***' })
  })

  it('422 em headers aparece em Headers HTTP', async () => {
    serveSaves('*/api/tools/:id', [refused('headers')])
    const user = userEvent.setup()
    renderTool()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText(/recusou algum header e não diz qual/)).toBeInTheDocument()
    expect(screen.getByText('Não foi possível salvar a tool (código 422)')).toBeInTheDocument()
  })

  it('422 num parâmetro aparece na linha dele', async () => {
    serveSaves('*/api/tools/:id', [refused('parameters.0')])
    const user = userEvent.setup()
    renderTool()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    // O erro da linha descreve o nome do parâmetro (aria-describedby).
    await screen.findByText(REJECTED)
    expect(screen.getByDisplayValue('cidade')).toHaveAccessibleDescription(REJECTED)
  })

  it.each([
    ['route', /^Rota/],
    ['http_method', /^Método HTTP/],
    ['instructions', /^Instruções/]
  ])('422 em %s aparece no campo', async (field, label) => {
    serveSaves('*/api/tools/:id', [refused(field)])
    const user = userEvent.setup()
    renderTool()

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await within(block(label)).findByText(REJECTED)).toBeInTheDocument()
  })
})
