import { act, screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import {
  RuntimeRevision,
  RuntimeRevisionProvider,
  useApplyRevision
} from '@/components/layout/RuntimeRevision'

import { renderWithIntl } from '../helpers/intl'
import { RUNTIME_URL } from '../msw/handlers'
import { server } from '../msw/server'

// P4-01 (D-P4-01-3): o provider da casca lê a revisão uma vez ao montar; o
// indicador mostra carregando, o valor ou indisponível; uma escrita aceita
// grava a revisão da resposta, sem novo request.

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

// Quem grava: o editor ou a ação, com o corpo de sucesso do BFF.
let applyRevision: ReturnType<typeof useApplyRevision> = () => undefined
function Writer() {
  applyRevision = useApplyRevision()
  return null
}

const renderShell = (locale: 'pt-BR' | 'en' = 'pt-BR') =>
  renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
      <Writer />
    </RuntimeRevisionProvider>,
    { locale }
  )

const indicator = () => screen.getByText(/runtime · rev\./).parentElement as HTMLElement

describe('RuntimeRevision', () => {
  it('carregando (aria-busy, skeleton) e depois o valor, com uma leitura só', async () => {
    const calls = serveRuntime(async () => {
      await delay(20)
      return HttpResponse.json({ success: true, data: { revision: 7 } })
    })
    renderShell()

    expect(indicator()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Carregando a revisão do runtime')).toHaveClass('sr-only')

    expect(await screen.findByText('Revisão do runtime: 7')).toHaveClass('sr-only')
    expect(indicator()).not.toHaveAttribute('aria-busy')
    expect(screen.getByText('7')).toHaveAttribute('aria-hidden', 'true')
    expect(calls.count).toBe(1)
  })

  it.each([
    ['orquestrador fora (503)', () => HttpResponse.json({ success: false, error: 'unreachable' }, { status: 503 })],
    ['prazo (504)', () => HttpResponse.json({ success: false, error: 'timeout' }, { status: 504 })],
    ['corpo fora do formato', () => HttpResponse.json({ success: true, data: { revision: '7' } })],
    ['não JSON', () => new HttpResponse('<html>')],
    ['rede', () => HttpResponse.error()]
  ])('%s ⇒ indisponível, com a dica no title', async (_, respond) => {
    serveRuntime(respond)
    renderShell()

    expect(await screen.findByText('Revisão do runtime indisponível')).toHaveClass('sr-only')
    expect(screen.getByText('indisponível')).toHaveAttribute('aria-hidden', 'true')
    expect(indicator()).toHaveAttribute('title', 'Não foi possível ler a revisão do runtime.')
  })

  it('EN', async () => {
    serveRuntime(() => HttpResponse.json({ success: false }, { status: 503 }))
    renderShell('en')

    expect(await screen.findByText('Runtime revision unavailable')).toBeInTheDocument()
    expect(screen.getByText('unavailable')).toBeInTheDocument()
    expect(indicator()).toHaveAttribute('title', "Couldn't read the runtime revision.")
  })

  it('escrita aceita troca o valor pelo contexto, sem nova leitura (também depois de indisponível)', async () => {
    const calls = serveRuntime(() => HttpResponse.json({ success: false }, { status: 503 }))
    renderShell()
    await screen.findByText('Revisão do runtime indisponível')

    let returned: number | undefined
    act(() => {
      returned = applyRevision({ runtimeRevision: 12 })
    })

    expect(returned).toBe(12)
    expect(screen.getByText('Revisão do runtime: 12')).toBeInTheDocument()
    expect(calls.count).toBe(1)
  })

  it.each([
    ['ausente', {}],
    ['inválida', { runtimeRevision: -1 }],
    ['texto', { runtimeRevision: '9' }]
  ])('escrita com revisão %s não mexe no indicador e devolve undefined', async (_, body) => {
    serveRuntime(() => HttpResponse.json({ success: true, data: { revision: 7 } }))
    renderShell()
    await screen.findByText('Revisão do runtime: 7')

    let returned: number | undefined = 0
    act(() => {
      returned = applyRevision(body)
    })

    expect(returned).toBeUndefined()
    expect(screen.getByText('Revisão do runtime: 7')).toBeInTheDocument()
  })

  it('escrita que responde antes da leitura vale (é mais nova)', async () => {
    // Portão criado fora do handler: a leitura fica presa até o release().
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let reached = false
    serveRuntime(async () => {
      reached = true
      await held
      return HttpResponse.json({ success: true, data: { revision: 3 } })
    })
    renderShell()
    // A leitura já saiu (e está presa) quando a escrita responde.
    await vi.waitFor(() => expect(reached).toBe(true))

    act(() => {
      applyRevision({ runtimeRevision: 8 })
    })
    expect(screen.getByText('Revisão do runtime: 8')).toBeInTheDocument()

    let settled = false
    await act(async () => {
      release()
      await held
      await delay(20)
      settled = true
    })
    expect(settled).toBe(true)
    expect(screen.getByText('Revisão do runtime: 8')).toBeInTheDocument()
    expect(screen.queryByText('Revisão do runtime: 3')).not.toBeInTheDocument()
  })
})
