import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentEditor } from '@/components/management/agents/AgentEditor'
import { AgentManagement } from '@/components/management/agents/AgentManagement'
import { ToolEditor } from '@/components/management/tools/ToolEditor'
import { ToolManagement } from '@/components/management/tools/ToolManagement'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// QA P1-05b. Complementa ListTable e EditorDelete: chips e "Mostrando" em
// /tools (sem filtro de status no BFF), estados do P1-05 no layout novo para
// tools, bordas do teto (100/100, 101/100), entrada hostil só como texto e
// falhas do excluir (rede, 5xx, 404, duplo clique, id codificado) nas tools.

const router = vi.hoisted(() => ({ push: (href: string) => href }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

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

const makeTool = (n: number, active = true) => ({
  id: `tool-${n}`,
  name: `Tool ${n}`,
  description: 'x',
  route: `https://api.example.test/${n}`,
  http_method: 'GET',
  parameters: [],
  active
})
const makeAgent = (n: number, active = true) => ({
  id: `agente-${n}`,
  nome: `Agente ${n}`,
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  active,
  tools_ids: []
})
const many = <T,>(count: number, make: (n: number) => T) =>
  Array.from({ length: count }, (_, i) => make(i + 1))

const page = <T,>(data: T[], total = data.length) =>
  HttpResponse.json({
    success: true,
    data: { data, total, page: 1, limit: 100, totalPages: 1 }
  })

const countChips = () => {
  const region = document.querySelector('[aria-live="polite"][aria-atomic="true"]')
  if (!region) throw new Error('região dos chips não montada')
  return Array.from(region.children).map((chip) => chip.textContent)
}

describe('tools: estados do P1-05 no layout novo (sem chips, ordem de precedência)', () => {
  it('carregando, erro 503, vazio e vazio do filtro: nenhum chip, nenhuma tabela e nenhum toast', async () => {
    server.use(
      http.get('*/api/tools', async () => {
        await delay('infinite')
        return page([])
      })
    )
    const loading = renderWithIntl(<ToolManagement />)
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando tools…')
    expect(countChips()).toEqual([])
    loading.unmount()

    server.use(
      http.get('*/api/tools', () =>
        HttpResponse.json({ success: false, error: 'cru' }, { status: 503 })
      )
    )
    const error = renderWithIntl(
      <>
        <ToolManagement />
        <Toaster />
      </>
    )
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('código 503')).toBeInTheDocument()
    expect(countChips()).toEqual([])
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText('cru')).not.toBeInTheDocument()
    // O sonner renderiza o toast num setTimeout: esvazia um macrotask antes de afirmar a ausência.
    await act(() => new Promise((resolve) => setTimeout(resolve)))
    expect(document.querySelector('[data-sonner-toast]')).toBeNull()
    error.unmount()

    server.use(http.get('*/api/tools', () => page([])))
    const user = userEvent.setup()
    renderWithIntl(<ToolManagement />)
    await screen.findByRole('heading', { name: 'O orquestrador ainda não tem tools' })
    expect(countChips()).toEqual([])
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Buscar'), 'zzz')
    await screen.findByRole('heading', { name: /Nenhuma tool encontrada/ })
    expect(countChips()).toEqual([])
  })

  it('erro depois de conteúdo (busca falha): bloco no lugar da tabela, chips somem; limpar a busca traz tudo de volta', async () => {
    server.use(
      http.get('*/api/tools', ({ request }) =>
        new URL(request.url).searchParams.get('search')
          ? HttpResponse.error()
          : page([makeTool(1), makeTool(2, false)])
      )
    )
    const user = userEvent.setup()
    renderWithIntl(<ToolManagement />)
    await screen.findAllByRole('link', { name: 'Tool 1' })
    expect(countChips()).toEqual(['2 tools', '1 ativa', '1 inativa'])

    await user.type(screen.getByLabelText('Buscar'), 'x')
    await screen.findByRole('alert')
    expect(countChips()).toEqual([])
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Buscar'))
    await screen.findAllByRole('link', { name: 'Tool 1' })
    expect(countChips()).toEqual(['2 tools', '1 ativa', '1 inativa'])
  })
})

describe('tools: chips e nota de teto (BFF sem filtro de status)', () => {
  it('a requisição leva limit=100 e nenhum parâmetro de status; a busca com & e JSON vai intacta no parâmetro e os chips contam o resultado', async () => {
    const urls: URL[] = []
    server.use(
      http.get('*/api/tools', ({ request }) => {
        const url = new URL(request.url)
        urls.push(url)
        return url.searchParams.get('search')
          ? page([makeTool(1), makeTool(3, false)])
          : page([makeTool(1), makeTool(2), makeTool(3, false)])
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<ToolManagement />)
    await screen.findAllByRole('link', { name: 'Tool 2' })
    expect(countChips()).toEqual(['3 tools', '2 ativas', '1 inativa'])

    await user.type(screen.getByLabelText('Buscar'), 'a&b=c {{"$ne":null}')
    await waitFor(() => expect(countChips()).toEqual(['2 tools', '1 ativa', '1 inativa']))
    expect(urls[0].searchParams.get('limit')).toBe('100')
    expect(urls[0].searchParams.has('active')).toBe(false)
    expect(urls.at(-1)?.searchParams.get('search')).toBe('a&b=c {"$ne":null}')
  })

  it('112 tools, 100 carregadas: só "112 tools" e "Mostrando 100 de 112" (sem chips de status)', async () => {
    server.use(http.get('*/api/tools', () => page(many(100, makeTool), 112)))
    renderWithIntl(<ToolManagement />)
    await screen.findAllByRole('link', { name: 'Tool 1' })

    expect(countChips()).toEqual(['112 tools'])
    expect(screen.getByText('Mostrando 100 de 112')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(101)
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(100)
  })

  it('borda do teto: 100 de 100 mostra os chips de status e nenhuma nota', async () => {
    server.use(http.get('*/api/tools', () => page(many(100, (n) => makeTool(n, n <= 60)), 100)))
    renderWithIntl(<ToolManagement />)
    await screen.findAllByRole('link', { name: 'Tool 1' })
    expect(countChips()).toEqual(['100 tools', '60 ativas', '40 inativas'])
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument()
  })

  it('borda do teto: 101 de 100 mostra só o total e a nota', async () => {
    server.use(http.get('*/api/tools', () => page(many(100, makeTool), 101)))
    renderWithIntl(<ToolManagement />)
    await screen.findAllByRole('link', { name: 'Tool 1' })
    expect(countChips()).toEqual(['101 tools'])
    expect(screen.getByText('Mostrando 100 de 101')).toBeInTheDocument()
  })
})

describe('agents: bordas do teto e filtro', () => {
  it('112 agentes com "Apenas ativos" ligado: só o total do filtro e a nota (active=true na requisição)', async () => {
    const urls: URL[] = []
    server.use(
      http.get('*/api/agents', ({ request }) => {
        const url = new URL(request.url)
        urls.push(url)
        return url.searchParams.get('active') === 'true'
          ? page(many(100, makeAgent), 105)
          : page(many(100, makeAgent), 112)
      })
    )
    const user = userEvent.setup()
    renderWithIntl(<AgentManagement />)
    await screen.findAllByRole('link', { name: 'Agente 1' })
    expect(countChips()).toEqual(['112 agentes'])
    expect(screen.getByText('Mostrando 100 de 112')).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Apenas ativos' }))
    await waitFor(() => expect(countChips()).toEqual(['105 agentes']))
    expect(screen.getByText('Mostrando 100 de 105')).toBeInTheDocument()
    expect(urls.at(-1)?.searchParams.get('limit')).toBe('100')
  })

  it('a nota de teto some quando o filtro reduz o total ao que foi carregado', async () => {
    server.use(
      http.get('*/api/agents', ({ request }) =>
        new URL(request.url).searchParams.get('search')
          ? page([makeAgent(1), makeAgent(2, false)])
          : page(many(100, makeAgent), 112)
      )
    )
    const user = userEvent.setup()
    renderWithIntl(<AgentManagement />)
    await screen.findAllByRole('link', { name: 'Agente 3' })
    expect(screen.getByText('Mostrando 100 de 112')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Buscar'), 'a')
    await waitFor(() => expect(countChips()).toEqual(['2 agentes', '1 ativo', '1 inativo']))
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument()
  })
})

describe('entrada hostil nas listas: sempre texto, nunca HTML nem link perigoso', () => {
  it('nome de agente com <img onerror> e id com "/" e "?": texto, href codificado', async () => {
    const hostile = {
      ...makeAgent(1),
      id: 'a/b?x=1#h',
      nome: '<img src=x onerror=alert(1)> <script>alert(2)</script>'
    }
    server.use(http.get('*/api/agents', () => page([hostile])))
    renderWithIntl(<AgentManagement />)

    const link = (await screen.findAllByRole('link', { name: hostile.nome }))[0]
    expect(link).toHaveAttribute('href', '/agents/a%2Fb%3Fx%3D1%23h')
    expect(document.querySelector('img[onerror], script')).toBeNull()
  })

  it('tool com route "javascript:" e nome com HTML: a rota é só texto/title, não vira link', async () => {
    const hostile = {
      ...makeTool(1),
      id: 'x y/z',
      name: '<b onmouseover=alert(1)>Tool</b>',
      route: 'javascript:alert(document.cookie)'
    }
    server.use(http.get('*/api/tools', () => page([hostile])))
    renderWithIntl(<ToolManagement />)

    const link = (await screen.findAllByRole('link', { name: hostile.name }))[0]
    expect(link).toHaveAttribute('href', '/tools/x%20y%2Fz')
    expect(document.querySelector('a[href^="javascript:"], b[onmouseover]')).toBeNull()
    expect(within(screen.getByRole('table')).getByTitle(hostile.route)).toHaveTextContent(
      hostile.route
    )
  })

  it('tool sem parameters, http_config nem updated_at: "0" e "—" sem quebrar', async () => {
    const bare = { id: 'nua', name: 'Nua', description: '', route: 'https://x.test', http_method: 'GET', active: true }
    server.use(http.get('*/api/tools', () => page([bare])))
    renderWithIntl(<ToolManagement />)
    const row = (await screen.findAllByRole('link', { name: 'Nua' }))[0].closest('tr')
    if (!row) throw new Error('linha')
    const cells = within(row).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent('0')
    expect(cells[4]).toHaveTextContent('—')
    expect(within(cells[4]).getByText('N/D')).toHaveClass('sr-only')
  })
})

describe('excluir tool no editor: falhas, concorrência e id codificado', () => {
  const tool = {
    id: 'a/b c',
    name: 'Clima',
    description: 'Previsão',
    route: 'https://api.example.test/clima',
    http_method: 'GET',
    parameters: []
  }
  const renderEditor = () =>
    renderWithIntl(
      <>
        <ToolEditor id={tool.id} />
        <Toaster />
      </>
    )
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Excluir tool' }))
    return screen.getByRole('dialog', { name: 'Excluir tool' })
  }

  it.each([
    ['rede caiu', () => HttpResponse.error(), 'Não foi possível excluir a tool'],
    [
      '500',
      () => HttpResponse.json({ success: false, error: 'cru' }, { status: 500 }),
      'Não foi possível excluir a tool (código 500)'
    ],
    [
      '404',
      () => HttpResponse.json({ success: false, error: 'cru' }, { status: 404 }),
      'Tool não encontrada'
    ]
  ])('%s: Dialog fecha, toast de erro, sem navegar, foco volta ao botão', async (_name, reply, text) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    server.use(
      http.get('*/api/tools/:id', () => HttpResponse.json({ success: true, data: tool })),
      http.delete('*/api/tools/:id', reply)
    )
    const user = userEvent.setup()
    renderEditor()

    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText(new RegExp(`^${text.replace(/[()]/g, '\\$&')}`))).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText('cru')).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Excluir tool' })).toHaveFocus())
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Clima')
  })

  it('durante o DELETE: "Excluindo…" desabilitado, uma única chamada, URL com o id codificado', async () => {
    const calls: string[] = []
    let release: () => void = () => undefined
    server.use(
      http.get('*/api/tools/:id', () => HttpResponse.json({ success: true, data: tool })),
      http.delete('*/api/tools/:id', async ({ request }) => {
        calls.push(new URL(request.url).pathname)
        await new Promise<void>((resolve) => (release = resolve))
        return HttpResponse.json({ success: true })
      })
    )
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    const user = userEvent.setup()
    renderEditor()

    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    const busy = await within(dialog).findByRole('button', { name: 'Excluindo…' })
    expect(busy).toBeDisabled()
    await user.click(busy)
    await user.click(busy)
    expect(calls).toEqual(['/api/tools/a%2Fb%20c'])
    expect(push).not.toHaveBeenCalled()

    release()
    await waitFor(() => expect(push).toHaveBeenCalledWith('/tools'))
    expect(calls).toHaveLength(1)
  })
})

describe('excluir agente no editor: rede caiu', () => {
  it('toast de erro, Dialog fechado, sem navegar e o form intacto', async () => {
    const agent = {
      id: 'alfa',
      nome: 'Agente Alfa',
      model: 'llama3.2',
      factoryIaModel: 'ollama',
      descricao: 'd',
      prompt: 'p',
      active: true,
      tools_ids: []
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const push = vi.spyOn(router, 'push')
    push.mockClear()
    server.use(
      http.get('*/api/tools', () => page([])),
      http.get('*/api/agents/:id', () => HttpResponse.json({ success: true, data: agent })),
      http.delete('*/api/agents/:id', () => HttpResponse.error())
    )
    const user = userEvent.setup()
    renderWithIntl(
      <>
        <AgentEditor id="alfa" />
        <Toaster />
      </>
    )
    await user.click(await screen.findByRole('button', { name: 'Excluir agente' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Excluir agente' })).getByRole('button', {
        name: 'Excluir'
      })
    )

    expect(await screen.findByText(/^Não foi possível excluir o agente/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nome *')).toHaveValue('Agente Alfa')
  })
})
