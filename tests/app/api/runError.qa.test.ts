// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { POST as runAgent } from '@/app/api/playground/agents/[id]/runs/route'
import { POST as runTeam } from '@/app/api/playground/teams/[id]/runs/route'
import { SESSION_COOKIE, createSession } from '@/server/session'

import { TEST_ENV, TEST_USER } from '../../../e2e/test-env'
import { server } from '../../msw/server'

// QA do QA1-03: o que o dev não alcançou no BFF do RunError. Complementa
// "RunError do run classificado pelo BFF" em playgroundChat.test.ts.

const BASE = TEST_ENV.ORCHESTRATOR_URL
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function post(path: string) {
  return new NextRequest(`http://playground.test${path}`, {
    method: 'POST',
    headers: {
      cookie: `${SESSION_COOKIE}=${await createSession(TEST_USER.username)}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ message: 'oi' })
  })
}

const runError = (content: string) =>
  `event: RunError\ndata: ${JSON.stringify({ event: 'RunError', session_id: 's1', content })}\n\n`

const detailOf = async (content: string) => {
  server.use(
    http.post(`${BASE}/agents/:id/runs`, () =>
      new HttpResponse(runError(content), { headers: { 'Content-Type': 'text/event-stream' } })
    )
  )
  const text = await (await runAgent(await post('/api/playground/agents/x-1/runs'), params('x-1'))).text()
  return JSON.parse(text.split('\n').find((line) => line.startsWith('data:'))!.slice(5)).error
}

describe('classificação: fronteira e várias linhas', () => {
  it('pydantic com dois campos inválidos: cita o primeiro, detalhe inteiro', async () => {
    const content =
      '2 validation errors for GenerateContentConfig\ntemperature\n  Input should be a valid number\ntop_p\n  Input should be a valid number'

    expect(await detailOf(content)).toEqual({ kind: 'invalidParam', param: 'temperature', detail: content })
  })

  it('o nome do parâmetro não carrega markup nem espaço (vai para o rótulo da bolha)', async () => {
    const error = await detailOf(
      '1 validation error for GenerateContentConfig\n<img src=x onerror=alert(1)>\n  Input should be a valid number'
    )

    // Não casa o formato do campo: cai em `other` e o texto fica só no detail.
    expect(error.kind).toBe('other')
    expect(error).not.toHaveProperty('param')
  })

  it('o parâmetro é só o nome do campo (com ponto de campo aninhado), no máximo 64 caracteres', async () => {
    const nested = await detailOf(
      '1 validation error for GenerateContentConfig\nthinking_config.thinking_budget\n  Input should be a valid integer'
    )
    const long = await detailOf(
      `1 validation error for GenerateContentConfig\n${'a'.repeat(65)}\n  Input should be a valid integer`
    )

    expect(nested).toMatchObject({ kind: 'invalidParam', param: 'thinking_config.thinking_budget' })
    expect(long.kind).toBe('other')
  })
})

describe('saneamento: o que o provedor pode ecoar além das chaves do orquestrador', () => {
  // Classes de eco de credencial do provedor (o playground não conhece essas
  // chaves; o saneamento é por forma). Um caso por classe.
  it('header x-api-key (Anthropic, sk-ant-) não chega ao detail', async () => {
    const { detail } = await detailOf("headers={'x-api-key': 'sk-ant-api03-AbCdEfGhIjKlMn'}")

    expect(detail).not.toMatch(/sk-ant/)
  })

  // QA1-03-B2: a chave do Gemini (AIza...) num header e a credencial Basic
  // ecoadas pelo provedor não chegam ao colapsável.
  it('QA1-03-B2: header x-goog-api-key (AIza...) não chega ao detail', async () => {
    const { detail } = await detailOf(
      'request headers: {"x-goog-api-key": "AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvW"}'
    )

    expect(detail).not.toMatch(/AIzaSy/)
  })

  it('QA1-03-B2: Authorization Basic não chega ao detail', async () => {
    const { detail } = await detailOf('Authorization: Basic dXNlcjpwYXNzd29yZA== recusado')

    expect(detail).not.toMatch(/dXNlcjpw/)
  })
})

describe('team', () => {
  it('TeamRunError que cita o endereço interno sai saneado também no team', async () => {
    server.use(
      http.post(`${BASE}/teams/:id/runs`, () =>
        new HttpResponse(
          `event: TeamRunError\ndata: ${JSON.stringify({ event: 'TeamRunError', session_id: 's1', content: `falhou em ${BASE}/agents/x/runs` })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } }
        )
      )
    )
    const text = await (await runTeam(await post('/api/playground/teams/t-1/runs'), params('t-1'))).text()

    expect(text).not.toContain(BASE)
    expect(text).toContain('[orquestrador]')
  })
})
