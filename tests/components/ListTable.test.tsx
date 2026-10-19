import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentManagement } from '@/components/management/agents/AgentManagement'
import { ToolManagement } from '@/components/management/tools/ToolManagement'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P1-05b (V-P1-05b-1..6): tabela no desktop, linhas no celular, sem
// editar/excluir na linha; chips de contagem com limit=100 (decisão 0014).

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

const makeAgent = (n: number, active = true) => ({
  id: `agente-${n}`,
  nome: `Agente ${n}`,
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  active,
  tools_ids: ['clima', 'cep']
})
const agents = [
  { ...makeAgent(1), updated_at: '2026-10-16T13:12:00.000Z' },
  makeAgent(2),
  makeAgent(3, false)
]
const tools = [
  {
    id: 'consulta-cep',
    name: 'Consulta de CEP',
    description: 'CEP',
    route: 'https://viacep.com.br/ws/{cep}/json',
    http_method: 'GET',
    parameters: [{ name: 'cep', type: 'string', description: 'CEP', required: true }],
    active: true
  },
  {
    id: 'abrir-chamado',
    name: 'Abrir chamado',
    description: 'Chamado',
    route: 'https://helpdesk.example.test/api/v2/tickets',
    http_method: 'POST',
    parameters: [],
    active: true
  },
  {
    id: 'cotacao',
    name: 'Cotação',
    description: 'Dólar',
    route: 'https://economia.example.test/last/USD-BRL',
    http_method: 'GET',
    parameters: [],
    active: false
  }
]

const page = <T,>(data: T[], total = data.length) =>
  HttpResponse.json({
    success: true,
    data: { data, total, page: 1, limit: 100, totalPages: 1 }
  })

/** Chips de contagem: a região aria-live fica sempre montada. */
const countChips = () => {
  const region = document.querySelector('[aria-live="polite"][aria-atomic="true"]')
  if (!region) throw new Error('região dos chips não montada')
  return Array.from(region.children).map((chip) => chip.textContent)
}
const table = () => screen.getByRole('table')

describe('lista de agentes', () => {
  it('V-P1-05b-1: colunas na ordem, nome como link, id e chip de modelo; nada de lápis/lixeira', async () => {
    server.use(http.get('*/api/agents', () => page(agents)))
    renderWithIntl(<AgentManagement />)

    await screen.findAllByRole('link', { name: 'Agente 1' })
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Agente',
      'Modelo',
      'Tools',
      'Status',
      'Atualizado',
      'Abrir'
    ])
    const row = within(table()).getByRole('link', { name: 'Agente 1' }).closest('tr')
    if (!row) throw new Error('linha da tabela')
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('agente-1')
    expect(cells[1]).toHaveTextContent('ollama/llama3.2')
    expect(cells[2]).toHaveTextContent('2')
    expect(cells[3]).toHaveTextContent('Ativo')
    expect(within(table()).getByRole('link', { name: 'Agente 1' })).toHaveAttribute(
      'href',
      '/agents/agente-1'
    )
    expect(within(row).getAllByRole('link')).toHaveLength(1)

    expect(screen.queryByRole('link', { name: 'Editar agente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir agente' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^(ID|Modelo|Tools|RAG):$/)).not.toBeInTheDocument()
  })

  it('Atualizado: no fuso do navegador (não no do servidor), completa no title; sem data, "—" e "N/D"', async () => {
    // O provider vem com o fuso do servidor (UTC no helper); o navegador está em UTC-3.
    const tz = process.env.TZ
    process.env.TZ = 'America/Sao_Paulo'
    try {
      server.use(http.get('*/api/agents', () => page(agents)))
      renderWithIntl(<AgentManagement />)

      await screen.findAllByRole('link', { name: 'Agente 1' })
      const [first, second] = within(table()).getAllByRole('row').slice(1)
      const updated = within(first).getAllByRole('cell')[4]
      expect(updated.querySelector('time')).toHaveAttribute('datetime', '2026-10-16T13:12:00.000Z')
      expect(updated.querySelector('time')).toHaveAttribute('title', '16/10/2026, 10:12')
      expect(updated).toHaveTextContent('16/10, 10:12')
      expect(within(second).getAllByRole('cell')[4]).toHaveTextContent('—N/D')
    } finally {
      process.env.TZ = tz
    }
  })

  it('V-P1-05b-3: linhas do celular com nome, status e "id · provider/modelo", um link por linha', async () => {
    server.use(http.get('*/api/agents', () => page(agents)))
    renderWithIntl(<AgentManagement />)

    await screen.findAllByRole('link', { name: 'Agente 1' })
    const rows = screen.getByRole('list')
    const items = within(rows).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[2]).toHaveTextContent('Agente 3')
    expect(items[2]).toHaveTextContent('Inativo')
    expect(items[2]).toHaveTextContent('agente-3 · ollama/llama3.2')
    expect(within(items[2]).getByRole('link')).toHaveAttribute('href', '/agents/agente-3')
  })

  it('V-P1-05b-2: até 100, chips de total, ativos e inativos; a requisição leva limit=100', async () => {
    const requested: string[] = []
    server.use(
      http.get('*/api/agents', ({ request }) => {
        requested.push(new URL(request.url).search)
        return page(agents)
      })
    )
    renderWithIntl(<AgentManagement />)

    await screen.findAllByRole('link', { name: 'Agente 1' })
    expect(countChips()).toEqual(['3 agentes', '2 ativos', '1 inativo'])
    expect(requested).toEqual(['?limit=100'])
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument()
  })

  it('V-P1-05b-4: total acima do carregado, só o chip do total e "Mostrando 100 de 112"', async () => {
    const hundred = Array.from({ length: 100 }, (_, i) => makeAgent(i + 1, i % 2 === 0))
    server.use(http.get('*/api/agents', () => page(hundred, 112)))
    renderWithIntl(<AgentManagement />)

    await screen.findAllByRole('link', { name: 'Agente 1' })
    expect(within(table()).getAllByRole('row')).toHaveLength(101)
    expect(countChips()).toEqual(['112 agentes'])
    expect(screen.getByText('Mostrando 100 de 112')).toBeInTheDocument()
  })

  it('zero no status: "0 ativos" e "0 inativas" (o one do CLDR pt inclui o 0)', async () => {
    server.use(
      http.get('*/api/agents', () => page([makeAgent(1, false), makeAgent(2, false)])),
      http.get('*/api/tools', () => page([tools[0]]))
    )
    const { unmount } = renderWithIntl(<AgentManagement />)
    await screen.findAllByRole('link', { name: 'Agente 1' })
    expect(countChips()).toEqual(['2 agentes', '0 ativos', '2 inativos'])
    unmount()

    const toolList = renderWithIntl(<ToolManagement />)
    await screen.findAllByRole('link', { name: 'Consulta de CEP' })
    expect(countChips()).toEqual(['1 tool', '1 ativa', '0 inativas'])
    toolList.unmount()

    renderWithIntl(<ToolManagement />, { locale: 'en' })
    await screen.findAllByRole('link', { name: 'Consulta de CEP' })
    expect(countChips()).toEqual(['1 tool', '1 active', '0 inactive'])
  })

  it('V-P1-05b-5: com busca, chips do resultado; com "Apenas ativos", só o total', async () => {
    server.use(
      http.get('*/api/agents', ({ request }) => {
        const params = new URL(request.url).searchParams
        if (params.get('active') === 'true') return page(agents.slice(0, 2))
        if (params.get('search')) return page([agents[0], agents[2]])
        return page(agents)
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<AgentManagement />)
    await screen.findAllByRole('link', { name: 'Agente 2' })

    await user.type(screen.getByLabelText('Buscar'), 'x')
    await waitFor(() => expect(countChips()).toEqual(['2 agentes', '1 ativo', '1 inativo']))

    await user.clear(screen.getByLabelText('Buscar'))
    await user.click(screen.getByRole('switch', { name: 'Apenas ativos' }))
    await waitFor(() => expect(countChips()).toEqual(['2 agentes']))
  })

  it('V-P1-05b-5: carregando, erro, vazio e vazio do filtro sem chips', async () => {
    server.use(
      http.get('*/api/agents', async () => {
        await delay('infinite')
        return page([])
      })
    )
    const { unmount } = renderWithIntl(<AgentManagement />)
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando agentes…')
    expect(countChips()).toEqual([])
    unmount()

    server.use(http.get('*/api/agents', () => HttpResponse.error()))
    const error = renderWithIntl(<AgentManagement />)
    await screen.findByRole('alert')
    expect(countChips()).toEqual([])
    error.unmount()

    server.use(http.get('*/api/agents', () => page([])))
    const user = userEvent.setup()
    renderWithIntl(<AgentManagement />)
    await screen.findByRole('heading', { name: 'O orquestrador ainda não tem agentes' })
    expect(countChips()).toEqual([])
    await user.type(screen.getByLabelText('Buscar'), 'x')
    await screen.findByRole('heading', { name: /Nenhum agente encontrado/ })
    expect(countChips()).toEqual([])
  })

  it('V-P1-05b-6: carregando com o cabeçalho real da tabela e 3 linhas de skeleton', async () => {
    server.use(
      http.get('*/api/agents', async () => {
        await delay('infinite')
        return page([])
      })
    )
    renderWithIntl(<AgentManagement />)

    const status = await screen.findByRole('status')
    const busy = status.closest('[aria-busy="true"]')
    if (!(busy instanceof HTMLElement)) throw new Error('aria-busy')
    const skeleton = within(busy).getByRole('table')
    expect(within(skeleton).getAllByRole('columnheader')[0]).toHaveTextContent('Agente')
    expect(within(skeleton).getAllByRole('row')).toHaveLength(4)
  })
})

describe('lista de tools', () => {
  it('V-P1-05b-2: colunas, chip "MÉTODO rota" com a URL no title, parâmetros e chips no feminino', async () => {
    server.use(http.get('*/api/tools', () => page(tools)))
    renderWithIntl(<ToolManagement />)

    await screen.findAllByRole('link', { name: 'Consulta de CEP' })
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Tool',
      'Requisição',
      'Parâmetros',
      'Status',
      'Atualizado',
      'Abrir'
    ])
    const row = within(table()).getByRole('link', { name: 'Consulta de CEP' }).closest('tr')
    if (!row) throw new Error('linha da tabela')
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('consulta-cep')
    expect(cells[1]).toHaveTextContent('GET https://viacep.com.br/ws/{cep}/json')
    expect(within(cells[1]).getByTitle('https://viacep.com.br/ws/{cep}/json')).toBeInTheDocument()
    expect(cells[2]).toHaveTextContent('1')
    expect(cells[3]).toHaveTextContent('Ativa')
    expect(within(table()).getByRole('link', { name: 'Consulta de CEP' })).toHaveAttribute(
      'href',
      '/tools/consulta-cep'
    )

    expect(countChips()).toEqual(['3 tools', '2 ativas', '1 inativa'])
    expect(screen.queryByRole('link', { name: 'Editar tool' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir tool' })).not.toBeInTheDocument()

    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('abrir-chamado · POST')
  })

  it('EN: chips e nota no idioma ("3 tools", "2 active", "Showing 100 of 112")', async () => {
    server.use(http.get('*/api/tools', () => page(tools)))
    const { unmount } = renderWithIntl(<ToolManagement />, { locale: 'en' })
    await screen.findAllByRole('link', { name: 'Consulta de CEP' })
    expect(countChips()).toEqual(['3 tools', '2 active', '1 inactive'])
    unmount()

    const hundred = Array.from({ length: 100 }, (_, i) => ({ ...tools[0], id: `t${i}`, name: `T${i}` }))
    server.use(http.get('*/api/tools', () => page(hundred, 112)))
    renderWithIntl(<ToolManagement />, { locale: 'en' })
    await screen.findAllByRole('link', { name: 'T0' })
    expect(countChips()).toEqual(['112 tools'])
    expect(screen.getByText('Showing 100 of 112')).toBeInTheDocument()
  })
})
