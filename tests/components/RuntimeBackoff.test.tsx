import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RuntimeRevision, RuntimeRevisionProvider } from '@/components/layout/RuntimeRevision'

import { renderWithIntl } from '../helpers/intl'
import { RUNTIME_URL, runtimeBody } from '../msw/handlers'
import { server } from '../msw/server'

// QA1-02 (#5, D-QA1-02-1): fora do ar ou degradado, a casca relê a saúde com
// backoff (5 s, 15 s, 30 s, depois a cada 60 s) e na volta do foco da aba.
// Online, nenhuma leitura extra. Relógio falso só no setTimeout: o fetch do
// MSW resolve por microtask.

type Health = 'down' | 'degraded' | 'healthy'

function serveHealth(initial: Health) {
  const server_ = { health: initial, reads: 0 }
  server.use(
    http.get(RUNTIME_URL, () => {
      server_.reads++
      if (server_.health === 'down')
        return HttpResponse.json({ success: false, error: 'unreachable' }, { status: 503 })
      return HttpResponse.json(runtimeBody(9, server_.health))
    })
  )
  return server_
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
// Deixa a leitura em curso responder (fetch e json do MSW).
const settle = async () => {
  for (let i = 0; i < 3; i++) await advance(0)
}
const indicator = () => screen.getByRole('link')

const setVisibility = (state: DocumentVisibilityState) =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })

const renderShell = async () => {
  const view = renderWithIntl(
    <RuntimeRevisionProvider>
      <RuntimeRevision />
    </RuntimeRevisionProvider>
  )
  await settle()
  return view
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  setVisibility('visible')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('status de conexão: releitura fora do ar (D-QA1-02-1)', () => {
  it('fora do ar na carga e volta depois: relê em 5 s, 15 s, 30 s e passa a "online · rev. 9" sozinho', async () => {
    const health = serveHealth('down')
    await renderShell()
    expect(indicator()).toHaveAccessibleName('Orquestrador fora do ar')
    expect(health.reads).toBe(1)

    await advance(4_999)
    expect(health.reads).toBe(1)
    await advance(1)
    await settle()
    expect(health.reads).toBe(2)

    await advance(15_000)
    await settle()
    expect(health.reads).toBe(3)

    health.health = 'healthy'
    await advance(29_999)
    expect(health.reads).toBe(3)
    await advance(1)
    await settle()
    expect(health.reads).toBe(4)
    expect(indicator()).toHaveTextContent('online · rev. 9')

    // Online: para de reler.
    await advance(10 * 60_000)
    expect(health.reads).toBe(4)
  })

  it('depois do 30 s, relê a cada 60 s', async () => {
    const health = serveHealth('down')
    await renderShell()
    for (const step of [5_000, 15_000, 30_000]) {
      await advance(step)
      await settle()
    }
    expect(health.reads).toBe(4)

    for (const expected of [5, 6, 7]) {
      await advance(59_999)
      expect(health.reads).toBe(expected - 1)
      await advance(1)
      await settle()
      expect(health.reads).toBe(expected)
    }
  })

  it('online na carga: uma leitura só', async () => {
    const health = serveHealth('healthy')
    await renderShell()
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 9')

    await advance(10 * 60_000)
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(health.reads).toBe(1)
  })

  it('degradado também relê, e para quando fica online', async () => {
    const health = serveHealth('degraded')
    await renderShell()
    expect(indicator()).toHaveAccessibleName('Orquestrador degradado, revisão 9')

    health.health = 'healthy'
    await advance(5_000)
    await settle()

    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 9')
    await advance(10 * 60_000)
    expect(health.reads).toBe(2)
  })

  it('volta do foco relê na hora; foco e visibilitychange juntos dão uma leitura', async () => {
    const health = serveHealth('down')
    await renderShell()

    health.health = 'healthy'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await settle()

    expect(health.reads).toBe(2)
    expect(indicator()).toHaveAccessibleName('Orquestrador online, revisão 9')
  })

  it('aba escondida não relê; ao voltar a ficar visível, relê', async () => {
    const health = serveHealth('down')
    await renderShell()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await advance(10 * 60_000)
    await settle()
    expect(health.reads).toBe(1)

    setVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await settle()
    expect(health.reads).toBe(2)

    // O backoff rearma depois da volta: com a aba escondida o 1º passo (5 s)
    // já foi gasto, então a próxima leitura sai em 15 s, e não some.
    await advance(14_999)
    expect(health.reads).toBe(2)
    await advance(1)
    await settle()
    expect(health.reads).toBe(3)
  })

  it('desmontar no meio do backoff para os timers e os ouvintes', async () => {
    const health = serveHealth('down')
    const view = await renderShell()

    view.unmount()
    await advance(10 * 60_000)
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(health.reads).toBe(1)
  })
})
