import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'

import {
  getAllPlaygroundSessionsAPI,
  getPlaygroundAgentsAPI,
  getPlaygroundStatusAPI,
  getPlaygroundTeamSessionsAPI,
  getPlaygroundTeamsAPI
} from '@/api/playground'

import { AGENTOS_URL } from '../msw/handlers'
import { server } from '../msw/server'

const internalError = () =>
  new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })

describe('getPlaygroundStatusAPI', () => {
  it('devolve 200 quando /status responde', async () => {
    expect(await getPlaygroundStatusAPI(AGENTOS_URL)).toBe(200)
  })

  it('cai para /health quando /status não existe (AgentOS sem AG-UI)', async () => {
    let healthCalls = 0
    server.use(
      http.get(`${AGENTOS_URL}/status`, () =>
        HttpResponse.json({ detail: 'Not Found' }, { status: 404 })
      ),
      http.get(`${AGENTOS_URL}/health`, () => {
        healthCalls += 1
        return HttpResponse.json({ status: 'ok' })
      })
    )

    expect(await getPlaygroundStatusAPI(AGENTOS_URL)).toBe(200)
    expect(healthCalls).toBe(1)
  })

  it('devolve o status do /health quando os dois falham', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/status`, () => internalError()),
      http.get(
        `${AGENTOS_URL}/health`,
        () => new HttpResponse(null, { status: 502 })
      )
    )

    expect(await getPlaygroundStatusAPI(AGENTOS_URL)).toBe(502)
  })

  it('devolve 503 quando a rede falha', async () => {
    server.use(http.get(`${AGENTOS_URL}/status`, () => HttpResponse.error()))

    expect(await getPlaygroundStatusAPI(AGENTOS_URL)).toBe(503)
  })
})

describe('getPlaygroundAgentsAPI', () => {
  it('converte a lista do AgentOS em opções do combobox', async () => {
    expect(await getPlaygroundAgentsAPI(AGENTOS_URL)).toEqual([
      {
        value: 'agent-1',
        label: 'Assistente',
        model: { provider: 'OpenAI', model: 'gpt-4o' },
        storage: true
      },
      {
        value: 'agent-2',
        label: 'Pesquisador',
        model: { provider: 'Ollama', model: 'llama3.2' },
        storage: false
      }
    ])
  })

  it('aceita a resposta no formato de config ({ agents: [...] })', async () => {
    server.use(
      http.get(`${AGENTOS_URL}/agents`, () =>
        HttpResponse.json({ agents: [{ agent_id: 'legado', name: 'Legado' }] })
      )
    )

    expect(await getPlaygroundAgentsAPI(AGENTOS_URL)).toEqual([
      {
        value: 'legado',
        label: 'Legado',
        model: { provider: '', model: '' },
        storage: false
      }
    ])
  })

  // BUG-P1-04b-1 (decisão 0012, D-P1-04b-2): o src/api não avisa o usuário;
  // relança com o status e o hook mostra a frase do catálogo.
  it('relança com o status em erro HTTP, sem toast', async () => {
    const toastError = vi.spyOn(toast, 'error')
    server.use(http.get(`${AGENTOS_URL}/agents`, () => internalError()))

    await expect(getPlaygroundAgentsAPI(AGENTOS_URL)).rejects.toMatchObject({
      message: 'Failed to fetch playground agents',
      cause: expect.objectContaining({ message: 'HTTP 500' })
    })
    expect(toastError).not.toHaveBeenCalled()
  })

  it('relança a falha de rede, sem toast', async () => {
    const toastError = vi.spyOn(toast, 'error')
    server.use(http.get(`${AGENTOS_URL}/agents`, () => HttpResponse.error()))

    await expect(getPlaygroundAgentsAPI(AGENTOS_URL)).rejects.toThrow()
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('getPlaygroundTeamsAPI', () => {
  it('converte a lista de times do AgentOS', async () => {
    expect(await getPlaygroundTeamsAPI(AGENTOS_URL)).toEqual([
      {
        value: 'team-1',
        label: 'Time de suporte',
        model: { provider: 'OpenAI', model: 'gpt-4o' },
        storage: true
      }
    ])
  })

  it('devolve lista vazia sem avisar quando o backend não tem times', async () => {
    const toastError = vi.spyOn(toast, 'error')
    server.use(
      http.get(`${AGENTOS_URL}/teams`, () =>
        HttpResponse.json({ detail: 'Not Found' }, { status: 404 })
      )
    )

    expect(await getPlaygroundTeamsAPI(AGENTOS_URL)).toEqual([])
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('getAllPlaygroundSessionsAPI', () => {
  it('lista as sessões do agente com data em segundos', async () => {
    expect(await getAllPlaygroundSessionsAPI(AGENTOS_URL, 'agent-1')).toEqual([
      {
        session_id: 'session-a1',
        title: 'Primeira conversa',
        created_at: Date.UTC(2026, 0, 2, 3, 4, 5) / 1000
      }
    ])
  })

  it('não traz sessões de outro agente', async () => {
    expect(await getAllPlaygroundSessionsAPI(AGENTOS_URL, 'agent-2')).toEqual(
      []
    )
  })

  it('relança com o status em erro HTTP (o hook avisa)', async () => {
    server.use(http.get(`${AGENTOS_URL}/sessions`, () => internalError()))

    await expect(getAllPlaygroundSessionsAPI(AGENTOS_URL, 'agent-1')).rejects.toMatchObject({
      message: 'Failed to fetch sessions',
      cause: expect.objectContaining({ message: 'HTTP 500' })
    })
  })
})

describe('getPlaygroundTeamSessionsAPI', () => {
  it('lista as sessões do time', async () => {
    expect(await getPlaygroundTeamSessionsAPI(AGENTOS_URL, 'team-1')).toEqual([
      {
        session_id: 'session-t1',
        title: 'Conversa do time',
        created_at: Date.UTC(2026, 1, 3, 4, 5, 6) / 1000
      }
    ])
  })
})
