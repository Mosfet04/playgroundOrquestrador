import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PlaygroundRequestError,
  deletePlaygroundSessionAPI,
  getPlaygroundEntitiesAPI,
  getPlaygroundSessionAPI,
  getPlaygroundSessionsAPI
} from '@/api/playground'

import { BFF, agentsFixture } from '../msw/handlers'
import { server } from '../msw/server'

// P2-03: o browser só fala com o BFF do chat. Sem resposta (rede, orquestrador
// fora, prazo) é "offline" (sem status); outro erro leva o status; 401 leva
// ao login com a URL atual.

afterEach(() => {
  vi.unstubAllGlobals()
})

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error
  )

describe('listas e sessões', () => {
  it('devolve o `data` do BFF', async () => {
    expect(await getPlaygroundEntitiesAPI('agent')).toEqual(agentsFixture)
    expect(await getPlaygroundSessionsAPI('agent', 'agent-2')).toEqual([])
  })

  it('codifica o id na query e no caminho; excluir é DELETE', async () => {
    const seen: string[] = []
    server.use(
      http.get(`${BFF}/sessions`, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json({ success: true, data: [] })
      }),
      http.all(`${BFF}/sessions/:id`, ({ request }) => {
        const url = new URL(request.url)
        seen.push(`${request.method} ${url.pathname}${url.search}`)
        return HttpResponse.json({ success: true, data: { chat_history: [] } })
      })
    )

    await getPlaygroundSessionsAPI('team', 'a b&c=1')
    await getPlaygroundSessionAPI('team', 'x/y')
    await deletePlaygroundSessionAPI('x/y')

    expect(seen).toEqual([
      '?type=team&component_id=a+b%26c%3D1',
      `GET ${BFF}/sessions/x%2Fy?type=team`,
      `DELETE ${BFF}/sessions/x%2Fy`
    ])
  })
})

describe('falhas', () => {
  it.each([
    ['unreachable', 503, undefined],
    ['timeout', 504, undefined],
    ['server_error', 502, 502],
    ['not_found', 404, 404]
  ])('BFF %s (%i) ⇒ status %s', async (error, status, expected) => {
    server.use(
      http.get(`${BFF}/agents`, () =>
        HttpResponse.json({ success: false, error }, { status })
      )
    )

    const caught = await failure(getPlaygroundEntitiesAPI('agent'))

    expect(caught).toBeInstanceOf(PlaygroundRequestError)
    expect((caught as PlaygroundRequestError).status).toBe(expected)
  })

  it('o servidor do playground não responde ⇒ offline', async () => {
    server.use(http.get(`${BFF}/agents`, () => HttpResponse.error()))

    const caught = await failure(getPlaygroundEntitiesAPI('agent'))

    expect((caught as PlaygroundRequestError).status).toBeUndefined()
  })

  it('401 ⇒ navegação completa para o login com path e query; a promessa não resolve', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', {
      href: 'http://localhost:3000/playground?agent=a%20b&session=s1',
      pathname: '/playground',
      search: '?agent=a%20b&session=s1',
      assign
    })
    server.use(
      http.delete(`${BFF}/sessions/:id`, () =>
        HttpResponse.json(
          { success: false, error: 'unauthorized' },
          { status: 401 }
        )
      )
    )
    const settled = vi.fn()

    void deletePlaygroundSessionAPI('s1').then(settled, settled)

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1))
    expect(assign).toHaveBeenCalledWith(
      `/login?reason=expired&next=${encodeURIComponent('/playground?agent=a%20b&session=s1')}`
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(settled).not.toHaveBeenCalled()
  })
})
