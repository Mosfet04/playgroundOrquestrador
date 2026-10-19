import { expect, test } from '@playwright/test'

import { FAKE_ORCHESTRATOR_URL } from '../playwright.config'

test.describe('fake orchestrator', () => {
  test('responde às rotas conhecidas', async ({ request }) => {
    const status = await request.get(`${FAKE_ORCHESTRATOR_URL}/status`)
    expect(status.status()).toBe(200)

    const agents = await request.get(`${FAKE_ORCHESTRATOR_URL}/agents`)
    expect(agents.status()).toBe(200)
    expect(await agents.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'agente-alfa' })])
    )
  })

  for (const [method, path] of [
    ['GET', '/rota-inexistente'],
    ['GET', '/playground/status'],
    ['DELETE', '/agents'],
    ['POST', '/agents/agente-inexistente/runs'],
    ['POST', '/teams/time-inexistente/runs'],
    // método errado em rota conhecida e forma diferente da rota de run
    ['POST', '/status'],
    ['POST', '/agents/agente-alfa/runs/'],
    ['POST', '/agents/agente-alfa/runs/extra']
  ]) {
    test(`responde 404 para ${method} ${path}`, async ({ request }) => {
      const response = await request.fetch(`${FAKE_ORCHESTRATOR_URL}${path}`, {
        method
      })
      expect(response.status()).toBe(404)
    })
  }

  test('lista times vazios e sessões vazias para time', async ({ request }) => {
    const teams = await request.get(`${FAKE_ORCHESTRATOR_URL}/teams`)
    expect(teams.status()).toBe(200)
    expect(await teams.json()).toEqual([])

    const sessions = await request.get(
      `${FAKE_ORCHESTRATOR_URL}/sessions?type=team&component_id=qualquer`
    )
    expect(sessions.status()).toBe(200)
    expect((await sessions.json()).data).toEqual([])
  })

  test('run em stream SSE: eventos na ordem, deltas e sessão registrada', async ({
    request
  }) => {
    const sessionId = `qa-${Date.now()}-${Math.random()}`
    const response = await request.post(
      `${FAKE_ORCHESTRATOR_URL}/agents/agente-beta/runs`,
      { multipart: { message: 'ping', session_id: sessionId, stream: 'true' } }
    )
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/event-stream')

    const blocks = (await response.text()).trim().split('\n\n')
    const events = blocks.map((block) => {
      const [eventLine, dataLine] = block.split('\n')
      return {
        name: eventLine.replace('event: ', ''),
        data: JSON.parse(dataLine.replace('data: ', ''))
      }
    })
    // P1-06: uma tool ok e uma com erro (a 2ª antes do último delta) e as
    // métricas do RunCompleted, nos campos do agno 2.5.
    expect(events.map((e) => e.name)).toEqual([
      'RunStarted',
      'ToolCallStarted',
      'ToolCallCompleted',
      'RunContent',
      'RunContent',
      'ToolCallStarted',
      'ToolCallCompleted',
      'RunContent',
      'RunCompleted'
    ])
    const completed = events.filter((e) => e.name === 'ToolCallCompleted')
    expect(completed.map((e) => e.data.tool)).toEqual([
      expect.objectContaining({
        tool_name: 'consultar_pedido',
        tool_call_error: false,
        metrics: { duration: 0.18 }
      }),
      expect.objectContaining({ tool_name: 'abrir_troca', tool_call_error: true })
    ])
    expect(events.at(-1)?.data.metrics).toMatchObject({
      duration: 1.4,
      input_tokens: 600,
      output_tokens: 212
    })
    for (const e of events) {
      expect(e.data.event).toBe(e.name)
      expect(e.data.session_id).toBe(sessionId)
    }
    const deltas = events
      .filter((e) => e.name === 'RunContent')
      .map((e) => e.data.content)
    expect(deltas.join('')).toBe('Agente Beta recebeu: ping')
    expect(events.at(-1)?.data.content).toBe('Agente Beta recebeu: ping')

    const sessions = await request.get(
      `${FAKE_ORCHESTRATOR_URL}/sessions?type=agent&component_id=agente-beta`
    )
    const { data } = await sessions.json()
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ session_id: sessionId, session_name: 'ping' })
      ])
    )
    // a sessão não vaza para outro agente
    const other = await request.get(
      `${FAKE_ORCHESTRATOR_URL}/sessions?type=agent&component_id=agente-alfa`
    )
    expect(JSON.stringify(await other.json())).not.toContain(sessionId)
  })

  test('reusar o session_id não duplica a sessão', async ({ request }) => {
    const sessionId = `qa-dup-${Date.now()}-${Math.random()}`
    for (const message of ['um', 'dois']) {
      const r = await request.post(
        `${FAKE_ORCHESTRATOR_URL}/agents/agente-alfa/runs`,
        { multipart: { message, session_id: sessionId } }
      )
      await r.text()
    }
    const sessions = await request.get(
      `${FAKE_ORCHESTRATOR_URL}/sessions?type=agent&component_id=agente-alfa`
    )
    const { data } = await sessions.json()
    expect(
      data.filter((s: { session_id: string }) => s.session_id === sessionId)
    ).toHaveLength(1)
  })
})
