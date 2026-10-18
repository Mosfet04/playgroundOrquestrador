import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AgentManagement } from '@/components/management/agents/AgentManagement'
import { ToolManagement } from '@/components/management/tools/ToolManagement'

import { server } from '../msw/server'
import { renderWithIntl } from '../helpers/intl'

// P1-05 (V1–V5): estados das listas no layout atual. Erro > vazio do filtro >
// vazio > conteúdo; erro de lista não vira toast nem "lista vazia".

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

const agent = {
  id: 'alfa',
  nome: 'Agente Alfa',
  model: 'llama3.2',
  factoryIaModel: 'ollama',
  active: true,
  tools_ids: []
}
const tool = { id: 'clima', name: 'Clima', description: 'Tempo', http_method: 'GET' }

const page = <T,>(data: T[]) =>
  HttpResponse.json({
    success: true,
    data: { data, total: data.length, page: 1, limit: 10, totalPages: 1 }
  })

const LISTS = [
  {
    name: 'agentes',
    path: '*/api/agents',
    item: agent,
    itemName: 'Agente Alfa',
    ui: <AgentManagement />,
    heading: 'Gerenciamento de agentes',
    loading: 'Carregando agentes…',
    error: 'Não foi possível carregar os agentes',
    empty: 'O orquestrador ainda não tem agentes',
    createFirst: 'Criar primeiro agente',
    newHref: '/agents/new',
    searchEmpty: 'Nenhum agente encontrado para “faturamento”'
  },
  {
    name: 'tools',
    path: '*/api/tools',
    item: tool,
    itemName: 'Clima',
    ui: <ToolManagement />,
    heading: 'Gerenciamento de tools',
    loading: 'Carregando tools…',
    error: 'Não foi possível carregar as tools',
    empty: 'O orquestrador ainda não tem tools',
    createFirst: 'Criar primeira tool',
    newHref: '/tools/new',
    searchEmpty: 'Nenhuma tool encontrada para “faturamento”'
  }
] as const

const renderList = (ui: React.ReactElement) =>
  renderWithIntl(
    <>
      {ui}
      <Toaster />
    </>
  )

describe.each(LISTS)('lista de $name', (list) => {
  it('carregando: skeleton com aria-busy e o texto em role="status"', async () => {
    server.use(http.get(list.path, async () => {
      await delay('infinite')
      return page([])
    }))
    renderList(list.ui)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(list.loading)
    expect(status.closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('erro sem resposta: bloco com chip "offline" e "Tentar de novo", sem toast e sem vazio', async () => {
    server.use(http.get(list.path, () => HttpResponse.error()))
    renderList(list.ui)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: list.error })).toBeInTheDocument()
    expect(alert).toHaveTextContent(
      'O orquestrador não respondeu. Confira se ele está no ar e tente de novo.'
    )
    expect(within(alert).getByText('offline')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.getAllByText(list.error)).toHaveLength(1)
    expect(screen.queryByText(list.empty)).not.toBeInTheDocument()
  })

  it('erro 503: chip "código 503"', async () => {
    server.use(
      http.get(list.path, () =>
        HttpResponse.json({ success: false, error: 'cru' }, { status: 503 })
      )
    )
    renderList(list.ui)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('código 503')).toBeInTheDocument()
    expect(within(alert).queryByText('offline')).not.toBeInTheDocument()
    expect(screen.queryByText('cru')).not.toBeInTheDocument()
  })

  it('"Tentar de novo": "Tentando…" com o bloco no lugar; deu certo, a lista aparece e o foco vai ao h1', async () => {
    let calls = 0
    let release: () => void = () => undefined
    server.use(
      http.get(list.path, async () => {
        calls += 1
        if (calls === 1) return HttpResponse.error()
        await new Promise<void>((resolve) => (release = resolve))
        return page([list.item])
      })
    )
    const user = userEvent.setup()
    renderList(list.ui)

    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    await user.click(retry)

    const busy = await screen.findByRole('button', { name: 'Tentando…' })
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    release()
    expect(await screen.findByRole('link', { name: list.itemName })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: list.heading })).toHaveFocus()
    )
  })

  it('"Tentar de novo" falhando de novo: o bloco fica e o foco continua no botão', async () => {
    server.use(http.get(list.path, () => HttpResponse.error()))
    const user = userEvent.setup()
    renderList(list.ui)

    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(retry).toHaveFocus()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('vazio: ilustração, texto novo, "criar" e "Ver primeiros passos"', async () => {
    server.use(http.get(list.path, () => page([])))
    renderList(list.ui)

    expect(await screen.findByRole('heading', { name: list.empty })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: list.createFirst })).toHaveAttribute(
      'href',
      list.newHref
    )
    expect(screen.getByRole('link', { name: 'Ver primeiros passos' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('digitar na busca com o retry pendente (R7): o foco fica no campo', async () => {
    let calls = 0
    server.use(
      http.get(list.path, async ({ request }) => {
        calls += 1
        if (new URL(request.url).searchParams.get('search')) return page([])
        if (calls === 1) return HttpResponse.error()
        await delay('infinite')
        return HttpResponse.error()
      })
    )
    const user = userEvent.setup()
    renderList(list.ui)

    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    await screen.findByRole('button', { name: 'Tentando…' })
    const search = screen.getByLabelText('Buscar')
    await user.click(search)
    await user.keyboard('abc')

    expect(await screen.findByRole('heading', { name: /“abc”/ })).toBeInTheDocument()
    expect(search).toHaveValue('abc')
    expect(search).toHaveFocus()
  })

  it('resposta obsoleta (R4): a falha lenta da 1ª carga não apaga o resultado da busca', async () => {
    server.use(
      http.get(list.path, async ({ request }) => {
        if (new URL(request.url).searchParams.get('search')) return page([list.item])
        await delay(150)
        return HttpResponse.error()
      })
    )
    const user = userEvent.setup()
    renderList(list.ui)

    await user.type(screen.getByLabelText('Buscar'), 'a')
    expect(await screen.findByRole('link', { name: list.itemName })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: list.itemName })).toBeInTheDocument()
  })

  it('vazio do filtro: o termo da busca e "Limpar filtros" (zera e volta o foco à busca)', async () => {
    server.use(
      http.get(list.path, ({ request }) =>
        new URL(request.url).searchParams.get('search') ? page([]) : page([list.item])
      )
    )
    const user = userEvent.setup()
    renderList(list.ui)
    await screen.findByRole('link', { name: list.itemName })

    const search = screen.getByLabelText('Buscar')
    await user.type(search, 'faturamento')

    expect(await screen.findByRole('heading', { name: list.searchEmpty })).toBeInTheDocument()
    expect(screen.queryByText(list.empty)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(search).toHaveValue('')
    expect(search).toHaveFocus()
    expect(await screen.findByRole('link', { name: list.itemName })).toBeInTheDocument()
  })
})

it('agentes: só com "Apenas ativos", o vazio do filtro é "Nenhum agente ativo"', async () => {
  server.use(
    http.get('*/api/agents', ({ request }) =>
      new URL(request.url).searchParams.get('active') ? page([]) : page([agent])
    )
  )
  const user = userEvent.setup()
  renderList(<AgentManagement />)
  await screen.findByRole('link', { name: 'Agente Alfa' })

  await user.click(screen.getByRole('switch', { name: 'Apenas ativos' }))

  expect(await screen.findByRole('heading', { name: 'Nenhum agente ativo' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(screen.getByRole('switch', { name: 'Apenas ativos' })).not.toBeChecked()
})
