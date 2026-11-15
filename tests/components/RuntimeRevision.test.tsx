import { act, screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import {
  RuntimeRevision,
  RuntimeRevisionProvider,
  useApplyRevision,
  useRefreshRuntime
} from '@/components/layout/RuntimeRevision'

import { renderWithIntl } from '../helpers/intl'
import { RUNTIME_URL, runtimeBody } from '../msw/handlers'
import { server } from '../msw/server'

// P4-01 e P4-05 (D-P4-05-4/12): o provider da casca lê a saúde uma vez ao
// montar; o indicador é um link para a /settings em carregando, online,
// degradado ou fora do ar. Uma escrita aceita troca só a revisão, sem request;
// o estado de saúde só muda por leitura.

// Conta as leituras e responde como mandado.
function serveRuntime(respond: () => Response | Promise<Response>) {
  const calls = { count: 0 }
  server.use(
    http.get(RUNTIME_URL, () => {
      calls.count++
      return respond()
    })
  )
  return calls
}

// Quem grava (editor, ação) e quem relê (Atualizar da /settings).
let applyRevision: ReturnType<typeof useApplyRevision> = () => undefined
let refresh: ReturnType<typeof useRefreshRuntime> = async () => false
function Consumers() {
  applyRevision = useApplyRevision()
  refresh = useRefreshRuntime()
  return null
}

const renderShell = (locale: 'pt-BR' | 'en' = 'pt-BR') =>
  renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <Consumers />
    </RuntimeRevisionProvider>,
    { locale }
  )

const indicator = () => screen.getByRole('link')

describe('RuntimeRevision (status de conexão)', () => {
  it('carregando (aria-busy, skeleton) e depois online com a revisão, link para /settings, uma leitura só', async () => {
    const calls = serveRuntime(async () => {
      await delay(20)
      return HttpResponse.json(runtimeBody(7))
    })
    renderShell()

    expect(indicator()).toHaveAttribute('aria-busy', 'true')
    expect(indicator()).toHaveAccessibleName('Conectando ao orquestrador')
    expect(indicator()).toHaveTextContent('runtime ·')

    expect(await screen.findByRole('link', { name: 'Orquestrador online, revisão 7' })).toHaveAttribute(
      'href',
      '/settings'
    )
    expect(indicator()).not.toHaveAttribute('aria-busy')
    expect(indicator()).not.toHaveAttribute('title')
    expect(screen.getByText('online')).toHaveClass('text-success')
    expect(screen.getByText('online').parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(indicator()).toHaveTextContent('online · rev. 7')
    expect(calls.count).toBe(1)
  })

  it('degradado (503 com corpo, no BFF 200 degraded): ícone e texto de atenção com a revisão', async () => {
    serveRuntime(() => HttpResponse.json(runtimeBody(28, 'degraded')))
    renderShell()

    expect(
      await screen.findByRole('link', { name: 'Orquestrador degradado, revisão 28' })
    ).toHaveTextContent('degradado · rev. 28')
    expect(screen.getByText('degradado')).toHaveClass('text-warning')
  })

  it.each([
    ['orquestrador fora (503)', () => HttpResponse.json({ success: false, error: 'unreachable' }, { status: 503 })],
    ['prazo (504)', () => HttpResponse.json({ success: false, error: 'timeout' }, { status: 504 })],
    ['502 (chave recusada, corpo inválido)', () => HttpResponse.json({ success: false, error: 'unauthorized' }, { status: 502 })],
    ['sessão vencida (401)', () => HttpResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })],
    ['corpo fora do formato', () => HttpResponse.json({ success: true, data: { revision: 7 } })],
    ['não JSON', () => new HttpResponse('<html>')],
    ['rede', () => HttpResponse.error()]
  ])('%s ⇒ fora do ar, com a dica no title', async (_, respond) => {
    serveRuntime(respond)
    renderShell()

    expect(await screen.findByRole('link', { name: 'Orquestrador fora do ar' })).toHaveAttribute(
      'title',
      'Orquestrador não respondeu. Veja os detalhes em Configurações.'
    )
    expect(screen.getByText('fora do ar')).toHaveClass('text-destructive')
    expect(indicator()).not.toHaveTextContent('rev.')
  })

  it('EN', async () => {
    serveRuntime(() => HttpResponse.json({ success: false }, { status: 503 }))
    const { unmount } = renderShell('en')

    expect(await screen.findByRole('link', { name: 'Orchestrator offline' })).toHaveAttribute(
      'title',
      "The orchestrator didn't respond. See the details in Settings."
    )
    unmount()

    serveRuntime(() => HttpResponse.json(runtimeBody(3, 'degraded')))
    renderShell('en')
    expect(await screen.findByRole('link', { name: 'Orchestrator degraded, revision 3' })).toHaveTextContent(
      'degraded · rev. 3'
    )
  })

  it('escrita aceita troca só a revisão, sem nova leitura; o estado (degradado) fica', async () => {
    const calls = serveRuntime(() => HttpResponse.json(runtimeBody(7, 'degraded')))
    renderShell()
    await screen.findByRole('link', { name: 'Orquestrador degradado, revisão 7' })

    let returned: number | undefined
    act(() => {
      returned = applyRevision({ runtimeRevision: 12 })
    })

    expect(returned).toBe(12)
    expect(indicator()).toHaveAccessibleName('Orquestrador degradado, revisão 12')
    expect(calls.count).toBe(1)
  })

  it('fora do ar segue fora do ar depois de uma escrita, até uma leitura (que traz a revisão dela)', async () => {
    let up = false
    const calls = serveRuntime(() =>
      up ? HttpResponse.json(runtimeBody(15)) : HttpResponse.json({ success: false }, { status: 503 })
    )
    renderShell()
    await screen.findByRole('link', { name: 'Orquestrador fora do ar' })

    act(() => {
      applyRevision({ runtimeRevision: 12 })
    })
    expect(indicator()).toHaveAccessibleName('Orquestrador fora do ar')

    up = true
    let read = false
    await act(async () => {
      read = await refresh()
    })
    expect(read).toBe(true)
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 15')
    expect(calls.count).toBe(2)
  })

  it('a leitura que falha depois de online leva a fora do ar', async () => {
    let up = true
    serveRuntime(() =>
      up ? HttpResponse.json(runtimeBody(4)) : HttpResponse.json({ success: false }, { status: 503 })
    )
    renderShell()
    await screen.findByRole('link', { name: 'Orquestrador online, revisão 4' })

    up = false
    let read = true
    await act(async () => {
      read = await refresh()
    })

    expect(read).toBe(false)
    expect(indicator()).toHaveAccessibleName('Orquestrador fora do ar')
  })

  it.each([
    ['ausente', {}],
    ['inválida', { runtimeRevision: -1 }],
    ['texto', { runtimeRevision: '9' }]
  ])('escrita com revisão %s não mexe no indicador e devolve undefined', async (_, body) => {
    serveRuntime(() => HttpResponse.json(runtimeBody(7)))
    renderShell()
    await screen.findByRole('link', { name: 'Orquestrador online, revisão 7' })

    let returned: number | undefined = 0
    act(() => {
      returned = applyRevision(body)
    })

    expect(returned).toBeUndefined()
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 7')
  })

  it('escrita que responde antes da leitura vale (é mais nova); o estado vem da leitura', async () => {
    // Portão criado fora do handler: a leitura fica presa até o release().
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let reached = false
    serveRuntime(async () => {
      reached = true
      await held
      return HttpResponse.json(runtimeBody(3, 'degraded'))
    })
    renderShell()
    // A leitura já saiu (e está presa) quando a escrita responde.
    await vi.waitFor(() => expect(reached).toBe(true))

    act(() => {
      applyRevision({ runtimeRevision: 8 })
    })
    expect(indicator()).toHaveAccessibleName('Conectando ao orquestrador')

    await act(async () => {
      release()
      await held
      await delay(20)
    })
    expect(indicator()).toHaveAccessibleName('Orquestrador degradado, revisão 8')
  })

  it('uma leitura nova substitui a que está em curso (a antiga não escreve)', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let first = true
    serveRuntime(async () => {
      if (!first) return HttpResponse.json(runtimeBody(10))
      first = false
      await held
      return HttpResponse.json(runtimeBody(2, 'degraded'))
    })
    renderShell()

    await act(async () => {
      await refresh()
    })
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 10')

    await act(async () => {
      release()
      await delay(20)
    })
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 10')
  })
})
