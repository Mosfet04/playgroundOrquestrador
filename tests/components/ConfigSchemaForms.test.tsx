import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentForm } from '@/components/management/agents/AgentForm'
import { ToolForm } from '@/components/management/tools/ToolForm'
import type { AgentConfig, Tool } from '@/types/management'

import { server } from '../msw/server'
import { SCHEMA_URL, schemaFixture } from '../msw/handlers'
import { renderWithIntl } from '../helpers/intl'

// P3-01: AgentForm e ToolForm oferecem as opções do GET /api/config/schema (o
// /admin/schema do orquestrador), sem lista fixa. Estados: carregando
// (selects desabilitados), falha (mensagem, "tentar de novo", sem salvar) e
// store só leitura (nada editável). Valor gravado fora das opções fica.

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

const noTools = http.get('*/api/tools', () =>
  HttpResponse.json({
    success: true,
    data: { data: [], total: 0, page: 1, limit: 100, totalPages: 1 }
  })
)

// O AgentForm lista as tools ao abrir.
beforeEach(() => server.use(noTools))

const serveSchema = (data: Partial<typeof schemaFixture>) =>
  server.use(
    http.get(SCHEMA_URL, () =>
      HttpResponse.json({ success: true, data: { ...schemaFixture, ...data } })
    )
  )
const failSchema = () =>
  server.use(
    http.get(SCHEMA_URL, () =>
      HttpResponse.json({ success: false, error: 'unreachable' }, { status: 503 })
    )
  )

const LOAD_ERROR = 'Não foi possível carregar as opções do orquestrador'
const READ_ONLY = /somente leitura/

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

const tool: Tool = {
  id: 'clima',
  name: 'Clima',
  description: 'Previsão do tempo',
  route: 'https://clima.example.com/v1',
  http_method: 'GET',
  parameters: [{ name: 'cidade', type: 'string', description: 'Cidade', required: true }],
  instructions: '',
  headers: {},
  active: true,
  version: 7
}

const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent)
const selectOf = (label: RegExp) => screen.getByRole('combobox', { name: label })
const saveButton = () => screen.getByRole('button', { name: 'Salvar' })

describe('AgentForm: opções do schema', () => {
  it('provider do modelo e do embedder são os do schema, sem lista fixa', async () => {
    serveSchema({
      chatProviders: [
        { name: 'ollama', modelParams: [], requiresBaseUrl: false },
        { name: 'fake-llm', modelParams: [], requiresBaseUrl: true }
      ],
      embedderProviders: ['fake-embed']
    })
    const user = userEvent.setup()
    renderWithIntl(<AgentForm onSuccess={() => {}} />)

    const provider = screen.getByRole('combobox', { name: /^Provedor \*/ })
    await waitFor(() => expect(provider).toBeEnabled())
    await user.click(provider)
    expect(optionNames()).toEqual(['ollama', 'fake-llm'])
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('switch', { name: 'Habilitar RAG' }))
    await user.click(screen.getByRole('combobox', { name: /Provedor de embedding/ }))
    expect(optionNames()).toEqual(['fake-embed'])
  })

  it('agent novo: o provider padrão ausente das opções vira o 1º do schema', async () => {
    serveSchema({
      chatProviders: [{ name: 'fake-llm', modelParams: [], requiresBaseUrl: true }]
    })
    renderWithIntl(<AgentForm onSuccess={() => {}} />)

    const provider = screen.getByRole('combobox', { name: /^Provedor \*/ })
    await waitFor(() => expect(provider).toHaveTextContent('fake-llm'))
  })

  it('carregando: selects desabilitados com o valor atual; liberam com o schema', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(SCHEMA_URL, async () => {
        await gate
        return HttpResponse.json({ success: true, data: schemaFixture })
      })
    )
    renderWithIntl(<AgentForm agent={agent} onSuccess={() => {}} />)

    const provider = screen.getByRole('combobox', { name: /^Provedor \*/ })
    expect(provider).toBeDisabled()
    expect(provider).toHaveTextContent('ollama')

    release()
    await waitFor(() => expect(provider).toBeEnabled())
  })

  it('falha: mensagem, sem salvar, e "Tentar de novo" recarrega', async () => {
    failSchema()
    const user = userEvent.setup()
    renderWithIntl(<AgentForm onSuccess={() => {}} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR)
    expect(saveButton()).toBeDisabled()
    expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeDisabled()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(screen.queryByText(LOAD_ERROR)).toBeNull()
    expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled()
  })

  it('store só leitura: aviso e nada editável, nem salvar nem excluir', async () => {
    serveSchema({ writable: false })
    renderWithIntl(<AgentForm agent={agent} onSuccess={() => {}} />)

    expect(await screen.findByText(READ_ONLY)).toBeVisible()
    expect(screen.getByLabelText(/^Nome/)).toBeDisabled()
    expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Agente ativo' })).toBeDisabled()
    expect(saveButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Excluir agente' })).toBeDisabled()
  })

  it('store só leitura: o clique no select não abre o menu nem muda o valor', async () => {
    serveSchema({ writable: false })
    renderWithIntl(
      <AgentForm
        agent={{
          ...agent,
          rag_config: { active: true, doc_name: 'd', model: 'e', factoryIaModel: 'openai' }
        }}
        onSuccess={() => {}}
      />
    )
    expect(await screen.findByText(READ_ONLY)).toBeVisible()

    // O `fieldset disabled` não impede o pointerdown num <button> (Chromium) e o
    // Radix abre o menu nele: o próprio Select tem de estar desabilitado.
    for (const trigger of [
      screen.getByRole('combobox', { name: /^Provedor \*/ }),
      screen.getByRole('combobox', { name: /Provedor de embedding/ })
    ]) {
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
      expect(screen.queryByRole('listbox')).toBeNull()
    }
  })

  it('config sem RAG, em edição: o provider de embedding não finge um padrão fora das opções', async () => {
    serveSchema({ embedderProviders: ['fake-embed'] })
    const user = userEvent.setup()
    renderWithIntl(<AgentForm agent={agent} onSuccess={() => {}} />)

    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Provedor \*/ })).toBeEnabled())
    await user.click(screen.getByRole('switch', { name: 'Habilitar RAG' }))

    expect(screen.getByRole('combobox', { name: /Provedor de embedding/ })).toHaveTextContent(
      'fake-embed'
    )
  })

  it('provider gravado fora das opções fica selecionado e volta no salvar', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put('*/api/agents/:id', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ success: true, data: {} })
      })
    )
    const user = userEvent.setup()
    renderWithIntl(
      <AgentForm agent={{ ...agent, factoryIaModel: 'retirado' }} onSuccess={() => {}} />
    )

    const provider = screen.getByRole('combobox', { name: /^Provedor \*/ })
    await waitFor(() => expect(provider).toBeEnabled())
    expect(provider).toHaveTextContent('retirado')
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ factoryIaModel: 'retirado' })
  })
})

describe('ToolForm: opções do schema', () => {
  it('tool nova: o método padrão ausente das opções vira o 1º do schema', async () => {
    serveSchema({ httpMethods: ['FETCH'] })
    renderWithIntl(<ToolForm onSuccess={() => {}} />)

    await waitFor(() => expect(selectOf(/^Método HTTP/)).toHaveTextContent('FETCH'))
  })

  it('métodos e tipos de parâmetro são os do schema, sem lista fixa', async () => {
    serveSchema({ httpMethods: ['GET', 'FETCH'], parameterTypes: ['string', 'fake-type'] })
    const user = userEvent.setup()
    renderWithIntl(<ToolForm tool={tool} onSuccess={() => {}} />)

    const method = selectOf(/^Método HTTP/)
    await waitFor(() => expect(method).toBeEnabled())
    await user.click(method)
    expect(optionNames()).toEqual(['GET', 'FETCH'])
    await user.keyboard('{Escape}')

    await user.click(selectOf(/^Tipo/))
    expect(optionNames()).toEqual(['string', 'fake-type'])
  })

  it('carregando: selects desabilitados com o valor atual', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(SCHEMA_URL, async () => {
        await gate
        return HttpResponse.json({ success: true, data: schemaFixture })
      })
    )
    renderWithIntl(<ToolForm tool={tool} onSuccess={() => {}} />)

    expect(selectOf(/^Método HTTP/)).toBeDisabled()
    expect(selectOf(/^Método HTTP/)).toHaveTextContent('GET')
    expect(selectOf(/^Tipo/)).toBeDisabled()

    release()
    await waitFor(() => expect(selectOf(/^Método HTTP/)).toBeEnabled())
    expect(selectOf(/^Tipo/)).toBeEnabled()
  })

  it('carregando: salvar desabilitado até o schema chegar', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(SCHEMA_URL, async () => {
        await gate
        return HttpResponse.json({ success: true, data: schemaFixture })
      })
    )
    renderWithIntl(<ToolForm onSuccess={() => {}} />)

    expect(saveButton()).toBeDisabled()

    release()
    await waitFor(() => expect(saveButton()).toBeEnabled())
  })

  it('"Tentar de novo": o aviso fica com "Tentando…" e o foco vai ao título ao dar certo', async () => {
    failSchema()
    const user = userEvent.setup()
    renderWithIntl(<ToolForm onSuccess={() => {}} />)
    await screen.findByRole('alert')

    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(SCHEMA_URL, async () => {
        await gate
        return HttpResponse.json({ success: true, data: schemaFixture })
      })
    )
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    const retrying = await screen.findByRole('button', { name: 'Tentando…' })
    expect(retrying).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('alert')).toBeVisible()

    release()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('falha: mensagem, sem salvar, e "Tentar de novo" recarrega', async () => {
    failSchema()
    const user = userEvent.setup()
    renderWithIntl(<ToolForm onSuccess={() => {}} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR)
    expect(saveButton()).toBeDisabled()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => expect(saveButton()).toBeEnabled())
    expect(screen.queryByText(LOAD_ERROR)).toBeNull()
  })

  it('store só leitura: aviso e nada editável, nem salvar nem excluir', async () => {
    serveSchema({ writable: false })
    renderWithIntl(<ToolForm tool={tool} onSuccess={() => {}} />)

    expect(await screen.findByText(READ_ONLY)).toBeVisible()
    for (const field of screen.getAllByLabelText(/^Nome/)) expect(field).toBeDisabled()
    expect(selectOf(/^Método HTTP/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adicionar parâmetro' })).toBeDisabled()
    expect(saveButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Excluir tool' })).toBeDisabled()
  })

  it('store só leitura: Substituir, Criar parâmetro, Adicionar, lixeiras e Switch não aceitam interação; preview segue', async () => {
    serveSchema({ writable: false })
    renderWithIntl(
      <ToolForm
        tool={{
          ...tool,
          route: 'https://clima.example.com/v1/{cidade}/{uf}',
          headers: { Authorization: '***', Accept: 'application/json' }
        }}
        onSuccess={() => {}}
      />
    )
    expect(await screen.findByText(READ_ONLY)).toBeVisible()

    for (const name of [
      'Substituir o valor de Authorization',
      'Criar parâmetro uf',
      'Adicionar header',
      'Adicionar parâmetro',
      'Remover Authorization',
      'Remover cidade'
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Obrigatório' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Tool ativa' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Requisição' })).toHaveTextContent(
      'GET https://clima.example.com/v1/{cidade}/{uf}'
    )
  })

  it('carregando: o preview já responde e salvar espera o schema', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(SCHEMA_URL, async () => {
        await gate
        return HttpResponse.json({ success: true, data: schemaFixture })
      })
    )
    renderWithIntl(<ToolForm tool={tool} onSuccess={() => {}} />)

    expect(screen.getByRole('region', { name: 'Requisição' })).toHaveTextContent(
      'GET https://clima.example.com/v1'
    )
    expect(saveButton()).toBeDisabled()
    release()
    await waitFor(() => expect(saveButton()).toBeEnabled())
  })

  it('carregando: "Carregando opções do orquestrador…" visível e a região em aria-busy; some ao chegar', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(SCHEMA_URL, async () => {
        await gate
        return HttpResponse.json({ success: true, data: schemaFixture })
      })
    )
    const { container } = renderWithIntl(<ToolForm tool={tool} onSuccess={() => {}} />)

    expect(screen.getByText('Carregando opções do orquestrador…').closest('[role="status"]')).not.toBeNull()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()

    release()
    await waitFor(() => expect(screen.queryByText('Carregando opções do orquestrador…')).toBeNull())
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('store só leitura: o clique nos selects não abre o menu', async () => {
    serveSchema({ writable: false })
    renderWithIntl(<ToolForm tool={tool} onSuccess={() => {}} />)
    expect(await screen.findByText(READ_ONLY)).toBeVisible()

    for (const trigger of [selectOf(/^Método HTTP/), selectOf(/^Tipo/)]) {
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
      expect(screen.queryByRole('listbox')).toBeNull()
    }
  })

  it('parâmetro novo começa com o 1º tipo do schema', async () => {
    serveSchema({ parameterTypes: ['fake-type', 'string'] })
    const user = userEvent.setup()
    renderWithIntl(<ToolForm onSuccess={() => {}} />)

    await waitFor(() => expect(selectOf(/^Método HTTP/)).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Adicionar parâmetro' }))

    expect(selectOf(/^Tipo/)).toHaveTextContent('fake-type')
  })

  it('método e tipo gravados fora das opções ficam selecionados e voltam no salvar', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put('*/api/tools/:id', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ success: true, data: {} })
      })
    )
    const user = userEvent.setup()
    renderWithIntl(
      <ToolForm
        tool={{
          ...tool,
          http_method: 'TRACE',
          parameters: [{ ...tool.parameters![0], type: 'number' }]
        }}
        onSuccess={() => {}}
      />
    )

    const method = selectOf(/^Método HTTP/)
    await waitFor(() => expect(method).toBeEnabled())
    expect(method).toHaveTextContent('TRACE')
    expect(selectOf(/^Tipo/)).toHaveTextContent('number')
    await user.click(saveButton())

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({
      http_method: 'TRACE',
      parameters: [{ name: 'cidade', type: 'number' }]
    })
  })
})
