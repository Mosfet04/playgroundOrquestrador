import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  getAllPlaygroundSessionsAPI,
  getPlaygroundAgentsAPI,
  getPlaygroundStatusAPI,
  getPlaygroundTeamSessionsAPI,
  getPlaygroundTeamsAPI
} from '@/api/playground'

import { AGENTOS_URL } from '../msw/handlers'
import { server } from '../msw/server'

// Caminhos de erro e formatos alternativos que complementam playground.test.ts.

describe('getPlaygroundStatusAPI (falhas)', () => {
  it('devolve 503 quando /status devolve erro e /health cai na rede', async () => {
    server.use(
      http.get(
        `${AGENTOS_URL}/status`,
        () => new HttpResponse(null, { status: 404 })
      ),
      http.get(`${AGENTOS_URL}/health`, () => HttpResponse.error())
    )

    expect(await getPlaygroundStatusAPI(AGENTOS_URL)).toBe(503)
  })
})

describe('getPlaygroundAgentsAPI (formatos)', () => {
  it('prefere agent_id a id e marca storage quando vem "storage"', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/agents`, () =>
        HttpResponse.json([
          { agent_id: 'novo', id: 'velho', name: 'A', storage: { x: 1 } }
        ])
      )
    )

    expect(await getPlaygroundAgentsAPI(AGENTOS_URL)).toEqual([
      { value: 'novo', label: 'A', model: { provider: '' }, storage: true }
    ])
  })
})

describe('getPlaygroundTeamsAPI (falhas e formatos)', () => {
  it('devolve lista vazia em erro 500', async () => {
    server.use(
      http.get(
        `${AGENTOS_URL}/teams`,
        () => new HttpResponse(null, { status: 500 })
      )
    )

    expect(await getPlaygroundTeamsAPI(AGENTOS_URL)).toEqual([])
  })

  it('devolve lista vazia em falha de rede', async () => {
    server.use(http.get(`${AGENTOS_URL}/teams`, () => HttpResponse.error()))

    expect(await getPlaygroundTeamsAPI(AGENTOS_URL)).toEqual([])
  })

  it('aceita { teams: [...] } e ignora corpo que não é lista', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/teams`, () =>
        HttpResponse.json({ teams: [{ team_id: 't9', name: 'Nove' }] })
      )
    )
    expect(await getPlaygroundTeamsAPI(AGENTOS_URL)).toEqual([
      { value: 't9', label: 'Nove', model: { provider: '' }, storage: false }
    ])

    server.use(
      http.get(`${AGENTOS_URL}/teams`, () =>
        HttpResponse.json({ teams: 'quebrado' })
      )
    )
    expect(await getPlaygroundTeamsAPI(AGENTOS_URL)).toEqual([])
  })
})

describe('sessões (falhas e formatos)', () => {
  it('404: lista vazia (agente e time)', async () => {
    server.use(http.get(`${AGENTOS_URL}/sessions`, () => new HttpResponse(null, { status: 404 })))

    expect(await getAllPlaygroundSessionsAPI(AGENTOS_URL, 'agent-1')).toEqual([])
    expect(await getPlaygroundTeamSessionsAPI(AGENTOS_URL, 'team-1')).toEqual([])
  })

  // BUG-P1-04b-1 (D-P1-04b-2): a falha sobe para o hook, que avisa no idioma.
  it.each([
    ['500', () => new HttpResponse(null, { status: 500 })],
    ['falha de rede', () => HttpResponse.error()]
  ])('%s: relança (agente e time)', async (_name, resolver) => {
    server.use(http.get(`${AGENTOS_URL}/sessions`, resolver))

    await expect(getAllPlaygroundSessionsAPI(AGENTOS_URL, 'agent-1')).rejects.toThrow()
    await expect(getPlaygroundTeamSessionsAPI(AGENTOS_URL, 'team-1')).rejects.toThrow()
  })

  it('aceita lista pura, com created_at numérico e título de reserva', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/sessions`, () =>
        HttpResponse.json([{ session_id: 's1', created_at: 1700000000 }])
      )
    )

    expect(await getAllPlaygroundSessionsAPI(AGENTOS_URL, 'agent-1')).toEqual([
      { session_id: 's1', title: 's1', created_at: 1700000000 }
    ])
  })

  it('envia o id do componente codificado e o tipo certo na query', async () => {
    const seen: URL[] = []
    server.use(
      http.get(`${AGENTOS_URL}/sessions`, ({ request }) => {
        seen.push(new URL(request.url))
        return HttpResponse.json({ data: [] })
      })
    )

    await getAllPlaygroundSessionsAPI(AGENTOS_URL, 'a b&c=1')
    await getPlaygroundTeamSessionsAPI(AGENTOS_URL, 'a b&c=1')

    expect(seen.map((u) => u.searchParams.get('type'))).toEqual([
      'agent',
      'team'
    ])
    expect(seen.map((u) => u.searchParams.get('component_id'))).toEqual([
      'a b&c=1',
      'a b&c=1'
    ])
  })
})
