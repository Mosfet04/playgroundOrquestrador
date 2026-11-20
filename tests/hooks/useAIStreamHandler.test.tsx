import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { usePlaygroundStore } from '@/store'

import { BFF } from '../msw/handlers'
import { server } from '../msw/server'
import { IntlProvider } from '../helpers/intl'

const initialStoreState = usePlaygroundStore.getState()

// Mesmo framing SSE do AgentOS (agno/os/utils.py: format_sse_event); no agno 3
// todo evento traz `nested_depth` (0 fora de workflow aninhado).
const sseStream = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify({ nested_depth: 0, ...e })}\n\n`)
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )

const contentEvents = (event: string, deltas: string[]) =>
  deltas.map((content) => ({
    event,
    content,
    content_type: 'str',
    session_id: 'session-1',
    created_at: 1
  }))

const sendMessage = async (mode: 'agent' | 'team', searchParams: string) => {
  usePlaygroundStore.setState({ mode })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <IntlProvider>
      <NuqsTestingAdapter searchParams={searchParams}>
        {children}
      </NuqsTestingAdapter>
    </IntlProvider>
  )
  const { result } = renderHook(() => useAIChatStreamHandler(), { wrapper })
  await act(() => result.current.handleStreamResponse('oi'))
  const messages = usePlaygroundStore.getState().messages
  return messages[messages.length - 1]
}

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('useAIChatStreamHandler: deltas do agno 2.5', () => {
  it('anexa cada RunContent, inclusive delta igual ao anterior', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream(contentEvents('RunContent', ['a', 'a']))
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    // Sem o fim do run o stream conta como interrompido (P2-03); o texto fica.
    expect(lastMessage).toMatchObject({ role: 'agent', content: 'aa' })
  })

  it('não corta o delta que contém o anterior', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream(contentEvents('RunContent', ['a', 'ab', 'c']))
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('aabc')
  })

  it('anexa cada TeamRunContent, inclusive delta igual ao anterior', async () => {
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sseStream(contentEvents('TeamRunContent', ['a', 'a']))
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    // Sem o fim do run o stream conta como interrompido (P2-03); o texto fica.
    expect(lastMessage).toMatchObject({ role: 'agent', content: 'aa' })
  })

  it('mantém o RunResponseContent legado como conteúdo acumulado', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream(contentEvents('RunResponseContent', ['a', 'ab']))
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('ab')
  })

  it('o RunCompleted fixa o texto final', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream([
          ...contentEvents('RunContent', ['a', 'a']),
          { event: 'RunCompleted', content: 'final', created_at: 2 }
        ])
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('final')
  })

  // O agno omite do JSON os campos None (agno/run/base.py): delta só de
  // raciocínio, citação ou mídia chega sem `content`.
  it('ignora o RunContent sem content', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream([
          {
            event: 'RunContent',
            reasoning_content: 'pensando',
            content_type: 'str',
            created_at: 1
          },
          ...contentEvents('RunContent', ['oi'])
        ])
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('oi')
  })
})

// O Team do agno repassa os eventos crus dos membros no SSE do team
// (stream_member_events=True por padrão em agno/team/team.py).
describe('useAIChatStreamHandler: eventos de membro no stream do team', () => {
  const memberEvents = [
    ...contentEvents('RunContent', ['membro diz X']),
    { event: 'RunCompleted', content: 'membro diz X', created_at: 2 }
  ]

  it('só os eventos do team escrevem o texto', async () => {
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sseStream([
          ...memberEvents,
          ...contentEvents('TeamRunContent', ['Lider: ', 'resumo'])
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.content).toBe('Lider: resumo')
  })

  it('o TeamRunCompleted fixa o texto final', async () => {
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sseStream([
          ...memberEvents,
          ...contentEvents('TeamRunContent', ['Lider: ', 'resumo']),
          { event: 'TeamRunCompleted', content: 'Lider: final', created_at: 3 }
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.content).toBe('Lider: final')
  })

  // Decisão 0007: o RunCompleted de membro não sobrescreve o texto, mas a mídia
  // dele segue mesclada (o TeamRunCompleted não traz a mídia dos membros).
  it('mantém as imagens do RunCompleted de membro', async () => {
    const image = { url: 'https://img.test/membro.png', revised_prompt: 'x' }
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sseStream([
          ...contentEvents('RunContent', ['membro diz X']),
          {
            event: 'RunCompleted',
            content: 'membro diz X',
            images: [image],
            created_at: 2
          },
          ...contentEvents('TeamRunContent', ['Lider: ', 'resumo']),
          { event: 'TeamRunCompleted', content: 'Lider: final', created_at: 3 }
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.content).toBe('Lider: final')
    expect(lastMessage.images).toEqual([image])
  })

  // BUG-P0-06-1: no JSON a barra final vira `\\` antes da aspa que fecha a
  // string; o parser do stream não pode tomar essa aspa por escapada.
  it('não perde o stream após delta terminado em barras pares', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream(contentEvents('RunContent', ['a\\\\', 'b', '\\"c']))
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.content).toBe('a\\\\b\\"c')
  })
})

// Team em modo `route` no agno 3.1.12 (agno/team/_default_tools.py): a
// delegação é um TeamToolCall `delegate_task_to_member`, e os eventos do membro
// saem entre o Started e o Completed dela, com `parent_run_id`. Com
// `respond_directly` a resposta do membro também sai como TeamRunContent.
describe('useAIChatStreamHandler: team route do agno 3', () => {
  const team = {
    team_id: 'team-1',
    team_name: 'Time',
    run_id: 'run-team',
    session_id: 'session-1',
    created_at: 1
  }
  const member = {
    agent_id: 'agent-1',
    agent_name: 'Agente',
    run_id: 'run-member',
    parent_run_id: 'run-team',
    session_id: 'session-1',
    created_at: 1
  }
  const delegation = {
    tool_call_id: 'call-delegate',
    tool_name: 'delegate_task_to_member',
    tool_args: { member_id: 'agent-1', task: 'oi' }
  }
  const memberTool = {
    tool_call_id: 'call-consulta',
    tool_name: 'consultar_pedido',
    tool_args: {}
  }
  const routeRun = [
    { ...team, event: 'TeamRunStarted', model: 'm' },
    { ...team, event: 'TeamModelRequestStarted', model: 'm' },
    {
      ...team,
      event: 'TeamModelRequestCompleted',
      model: 'm',
      input_tokens: 300,
      output_tokens: 20,
      total_tokens: 320
    },
    { ...team, event: 'TeamToolCallStarted', tool: delegation },
    { ...member, event: 'RunStarted', model: 'm' },
    { ...member, event: 'ModelRequestStarted', model: 'm' },
    { ...member, event: 'ToolCallStarted', tool: memberTool },
    {
      ...member,
      event: 'ToolCallCompleted',
      tool: { ...memberTool, tool_call_error: false, metrics: { duration: 0.2 } }
    },
    { ...team, event: 'TeamRunContent', content: 'Resposta ', content_type: 'str' },
    { ...member, event: 'RunContent', content: 'Resposta ', content_type: 'str' },
    { ...team, event: 'TeamRunContent', content: 'do membro', content_type: 'str' },
    { ...member, event: 'RunContent', content: 'do membro', content_type: 'str' },
    { ...member, event: 'ModelRequestCompleted', model: 'm', input_tokens: 300 },
    { ...member, event: 'RunContentCompleted' },
    {
      ...member,
      event: 'RunCompleted',
      content: 'Resposta do membro',
      content_type: 'str',
      metrics: { duration: 0.9, input_tokens: 300, output_tokens: 90 }
    },
    {
      ...team,
      event: 'TeamToolCallCompleted',
      tool: {
        ...delegation,
        tool_call_error: false,
        result: 'Resposta do membro',
        child_run_id: 'run-member',
        metrics: { duration: 1.2 }
      }
    },
    {
      ...team,
      event: 'TeamRunCompleted',
      content: 'Resposta do membro',
      content_type: 'str',
      member_responses: [
        { ...member, content: 'Resposta do membro', content_type: 'str' }
      ],
      metrics: { duration: 1.4, input_tokens: 600, output_tokens: 212 }
    }
  ]

  const runRoute = async () => {
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () => sseStream(routeRun))
    )
    return sendMessage('team', '?team=team-1')
  }

  it('mostra só a resposta do team, sem duplicar a do membro, e conclui o run', async () => {
    const lastMessage = await runRoute()

    expect(lastMessage).toMatchObject({
      role: 'agent',
      content: 'Resposta do membro'
    })
    expect(lastMessage.streamingError).toBe(false)
    expect(usePlaygroundStore.getState().streamingErrorMessage).toBeNull()
  })

  it('lista a delegação e a tool do membro, cada uma concluída', async () => {
    const lastMessage = await runRoute()

    expect(lastMessage.tool_calls).toEqual([
      expect.objectContaining({
        tool_call_id: 'call-delegate',
        tool_name: 'delegate_task_to_member',
        tool_call_error: false,
        metrics: { duration: 1.2 }
      }),
      expect.objectContaining({
        tool_call_id: 'call-consulta',
        tool_name: 'consultar_pedido',
        tool_call_error: false
      })
    ])
  })

  it('as métricas são as do team, não as do membro', async () => {
    const lastMessage = await runRoute()

    expect(lastMessage.metrics).toEqual({
      duration: 1.4,
      input_tokens: 600,
      output_tokens: 212
    })
  })
})

// D-P1-06-2 (decisão 0015): o agno 2.5 manda o tempo da tool em
// `tool.metrics.duration` (ToolCallMetrics) e as métricas da resposta em
// `metrics` do RunCompleted/TeamRunCompleted (RunMetrics, agno/metrics.py).
describe('useAIChatStreamHandler: métricas (P1-06)', () => {
  const tool = (extra: Record<string, unknown>) => ({
    tool_call_id: 'call-1',
    tool_name: 'consultar_pedido',
    tool_args: {},
    ...extra
  })

  it('guarda o tempo da tool e o erro do ToolCallCompleted', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream([
          { event: 'ToolCallStarted', tool: tool({}), created_at: 1 },
          {
            event: 'ToolCallCompleted',
            tool: tool({ tool_call_error: false, metrics: { duration: 0.18 } }),
            created_at: 1
          },
          ...contentEvents('RunContent', ['ok'])
        ])
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.tool_calls).toHaveLength(1)
    expect(lastMessage.tool_calls?.[0]).toMatchObject({
      tool_name: 'consultar_pedido',
      tool_call_error: false,
      metrics: { duration: 0.18 }
    })
  })

  it('guarda as métricas do RunCompleted na mensagem', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream([
          ...contentEvents('RunContent', ['ok']),
          {
            event: 'RunCompleted',
            content: 'ok',
            created_at: 2,
            metrics: { input_tokens: 600, output_tokens: 212, total_tokens: 812, duration: 1.4 }
          }
        ])
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.metrics).toEqual({ duration: 1.4, input_tokens: 600, output_tokens: 212 })
  })

  it('RunCompleted sem metrics: a mensagem fica sem métricas', async () => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream([{ event: 'RunCompleted', content: 'ok', created_at: 2 }])
      )
    )

    const lastMessage = await sendMessage('agent', '?agent=agent-1')

    expect(lastMessage.metrics).toBeUndefined()
  })

  it('no team, ignora as métricas do RunCompleted de membro (decisão 0007)', async () => {
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sseStream([
          {
            event: 'RunCompleted',
            content: 'membro',
            created_at: 2,
            metrics: { input_tokens: 1, output_tokens: 1, duration: 0.1 }
          },
          ...contentEvents('TeamRunContent', ['Lider']),
          {
            event: 'TeamRunCompleted',
            content: 'Lider',
            created_at: 3,
            metrics: { input_tokens: 900, output_tokens: 304, duration: 2.6 }
          }
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.metrics).toEqual({ duration: 2.6, input_tokens: 900, output_tokens: 304 })
  })

  it('membro sem TeamRunCompleted: nenhuma métrica do membro', async () => {
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sseStream([
          {
            event: 'RunCompleted',
            content: 'membro',
            created_at: 2,
            metrics: { input_tokens: 1, output_tokens: 1, duration: 0.1 }
          }
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.metrics).toBeUndefined()
  })
})

// QA P1-06
describe('useAIChatStreamHandler: métricas hostis (QA P1-06)', () => {
  const runWith = async (metrics: unknown) => {
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () =>
        sseStream([
          ...contentEvents('RunContent', ['ok']),
          { event: 'RunCompleted', content: 'ok', created_at: 2, metrics }
        ])
      )
    )
    return sendMessage('agent', '?agent=agent-1')
  }

  it.each([
    ['strings', { duration: '1.4', input_tokens: '600', output_tokens: '212' }],
    ['nulos', { duration: null, input_tokens: null, output_tokens: null }],
    ['objeto vazio', {}],
    ['não-objeto', 'rápido']
  ])('métricas %s: a mensagem fica sem métricas e o texto final segue', async (_, metrics) => {
    const lastMessage = await runWith(metrics)

    expect(lastMessage.metrics).toBeUndefined()
    expect(lastMessage.content).toBe('ok')
  })

  it('só os 3 números entram; o resto do RunMetrics (modelo, tokens totais) fica de fora', async () => {
    const lastMessage = await runWith({ duration: 2, input_tokens: 5, total_tokens: 99, model: 'x', secret: 'y' })

    expect(lastMessage.metrics).toEqual({ duration: 2, input_tokens: 5 })
  })
})

// AG3-04: a sequência real do agno 3.1.12 para um agente com as tools de
// raciocínio (agent/_response.py:1656-1705): ToolCallStarted/Completed de
// think/analyze, ReasoningStarted e, logo depois do ToolCallCompleted, o
// ReasoningStep (content sem os campos None); no fim, ReasoningCompleted
// (content.reasoning_steps) e RunCompleted (reasoning_steps com null).
describe('useAIChatStreamHandler: raciocínio do agno 3 (AG3-04)', () => {
  const understand = {
    title: 'Entender o pedido',
    action: 'Conferir o contexto da conversa',
    reasoning: 'O usuário quer uma resposta curta; vou conferir o contexto antes.',
    next_action: 'continue',
    confidence: 0.8
  }
  const validate = {
    title: 'Validar a resposta',
    result: 'O contexto cobre o pedido.',
    reasoning: 'Posso responder sem buscar mais dados.',
    next_action: 'final_answer',
    confidence: 0.9
  }
  const nulls = {
    title: null,
    action: null,
    result: null,
    reasoning: null,
    next_action: null,
    confidence: null
  }
  const think = {
    tool_call_id: 'call-think',
    tool_name: 'think',
    tool_args: { title: understand.title, thought: understand.reasoning }
  }
  const analyze = {
    tool_call_id: 'call-analyze',
    tool_name: 'analyze',
    tool_args: { title: validate.title, analysis: validate.reasoning }
  }
  const lookup = { tool_call_id: 'call-lookup', tool_name: 'consultar_pedido', tool_args: {} }

  const toolEvents = (tool: Record<string, unknown>) => [
    { event: 'ToolCallStarted', tool, created_at: 1 },
    { event: 'ToolCallCompleted', tool: { ...tool, metrics: { duration: 0.02 } }, created_at: 1 }
  ]
  const stepEvent = (content: unknown) => ({
    event: 'ReasoningStep',
    content,
    content_type: 'ReasoningStep',
    created_at: 1
  })
  const reasoningRun = [
    { event: 'RunStarted', session_id: 'session-1', created_at: 1 },
    ...toolEvents(think),
    { event: 'ReasoningStarted', created_at: 1 },
    stepEvent(understand),
    ...toolEvents(analyze),
    stepEvent(validate),
    ...toolEvents(lookup),
    ...contentEvents('RunContent', ['Resposta']),
    {
      event: 'ReasoningCompleted',
      content: { reasoning_steps: [understand, validate] },
      content_type: 'ReasoningSteps',
      created_at: 2
    },
    {
      event: 'RunCompleted',
      content: 'Resposta',
      created_at: 3,
      reasoning_steps: [
        { ...nulls, ...understand },
        { ...nulls, ...validate }
      ]
    }
  ]

  const runAgent = (events: Record<string, unknown>[]) => {
    server.use(http.post(`${BFF}/agents/agent-1/runs`, () => sseStream(events)))
    return sendMessage('agent', '?agent=agent-1')
  }

  it('lista os passos do ReasoningStep, e o chip de think/analyze some', async () => {
    const lastMessage = await runAgent(reasoningRun.slice(0, -2))

    expect(lastMessage.extra_data?.reasoning_steps).toEqual([understand, validate])
    expect(lastMessage.tool_calls?.map((tool) => tool.tool_name)).toEqual(['consultar_pedido'])
  })

  // Identidade do passo: título + ordem (a n-ésima ocorrência do título). O
  // ReasoningCompleted e o RunCompleted repetem a lista inteira.
  it('ReasoningCompleted e RunCompleted não duplicam os passos', async () => {
    const lastMessage = await runAgent(reasoningRun)

    expect(lastMessage.extra_data?.reasoning_steps).toEqual([understand, validate])
  })

  it('o RunCompleted sozinho preenche os passos, sem os campos null', async () => {
    const lastMessage = await runAgent([
      { event: 'RunCompleted', content: 'ok', created_at: 3, reasoning_steps: [{ ...nulls, ...validate }] }
    ])

    expect(lastMessage.extra_data?.reasoning_steps).toEqual([validate])
    expect(lastMessage.extra_data?.reasoning_steps?.[0]).not.toHaveProperty('action')
  })

  it('o ReasoningCompleted sozinho preenche os passos', async () => {
    const lastMessage = await runAgent([
      { event: 'ReasoningCompleted', content: { reasoning_steps: [understand] }, created_at: 2 }
    ])

    expect(lastMessage.extra_data?.reasoning_steps).toEqual([understand])
  })

  it('passos de mesmo título entram na ordem; a lista final só completa o que falta', async () => {
    const again = { ...understand, reasoning: 'De novo.' }
    const lastMessage = await runAgent([
      stepEvent(understand),
      stepEvent(again),
      { event: 'ReasoningCompleted', content: { reasoning_steps: [understand, again, validate] }, created_at: 2 }
    ])

    expect(lastMessage.extra_data?.reasoning_steps).toEqual([understand, again, validate])
  })

  it('tool comum chamada think, sem ReasoningStep, continua com chip', async () => {
    const plainThink = { tool_call_id: 'call-plain', tool_name: 'think', tool_args: { query: 'x' } }
    const lastMessage = await runAgent([
      ...toolEvents(plainThink),
      { event: 'RunCompleted', content: 'ok', created_at: 3 }
    ])

    expect(lastMessage.tool_calls?.map((tool) => tool.tool_name)).toEqual(['think'])
    expect(lastMessage.extra_data?.reasoning_steps ?? []).toEqual([])
  })

  it('passo sem título, content que não é objeto e lista que não é lista são ignorados', async () => {
    const lastMessage = await runAgent([
      stepEvent(5),
      stepEvent({ action: 'sem título' }),
      { event: 'ReasoningCompleted', content: { reasoning_steps: 5 }, created_at: 2 },
      { event: 'RunCompleted', content: 'ok', created_at: 3, reasoning_steps: 'x' }
    ])

    expect(lastMessage.extra_data?.reasoning_steps ?? []).toEqual([])
    expect(lastMessage).toMatchObject({ content: 'ok', streamingError: false })
  })

  // Decisão 0007: no team a bolha é do líder; os passos do membro (eventos
  // com parent_run_id) entram nela, e o RunCompleted do membro não duplica.
  it('team: os passos do membro vão para a bolha do team, sem duplicar', async () => {
    const member = { agent_id: 'alfa', run_id: 'run-m', parent_run_id: 'run-t' }
    const [thinkStarted, thinkCompleted] = toolEvents(think)
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sseStream([
          { event: 'TeamRunStarted', session_id: 'session-1', created_at: 1 },
          { ...member, ...thinkStarted },
          { ...member, ...thinkCompleted },
          { ...member, ...stepEvent(understand) },
          {
            ...member,
            event: 'ReasoningCompleted',
            content: { reasoning_steps: [understand] },
            created_at: 2
          },
          {
            ...member,
            event: 'RunCompleted',
            content: 'membro',
            created_at: 2,
            reasoning_steps: [{ ...nulls, ...understand }]
          },
          { event: 'TeamRunCompleted', content: 'Lider', created_at: 3 }
        ])
      )
    )
    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.extra_data?.reasoning_steps).toEqual([understand])
    expect(lastMessage.tool_calls).toEqual([])
    expect(lastMessage.content).toBe('Lider')
  })

  // Os eventos de membro são de runs diferentes na mesma bolha: a lista de um
  // não pode tomar o lugar do passo de outro com o mesmo título.
  it('team: dois membros com o mesmo título de passo ficam os dois', async () => {
    const memberOne = { agent_id: 'alfa', run_id: 'run-m1', parent_run_id: 'run-t' }
    const memberTwo = { agent_id: 'beta', run_id: 'run-m2', parent_run_id: 'run-t' }
    const theirs = { ...understand, reasoning: 'Visão do segundo membro.' }
    const memberEvents = (member: typeof memberOne, step: typeof understand) => [
      { ...member, ...stepEvent(step) },
      {
        ...member,
        event: 'ReasoningCompleted',
        content: { reasoning_steps: [step] },
        created_at: 2
      },
      {
        ...member,
        event: 'RunCompleted',
        content: 'membro',
        created_at: 2,
        reasoning_steps: [{ ...nulls, ...step }]
      }
    ]
    server.use(
      http.post(`${BFF}/teams/team-1/runs`, () =>
        sseStream([
          { event: 'TeamRunStarted', session_id: 'session-1', created_at: 1 },
          ...memberEvents(memberOne, understand),
          ...memberEvents(memberTwo, theirs),
          { event: 'TeamRunCompleted', content: 'Lider', created_at: 3 }
        ])
      )
    )

    const lastMessage = await sendMessage('team', '?team=team-1')

    expect(lastMessage.extra_data?.reasoning_steps).toEqual([understand, theirs])
  })

  it('tool com tool_name que não é texto não derruba o passo', async () => {
    const lastMessage = await runAgent([
      { event: 'ToolCallCompleted', tool: { tool_call_id: 'c1', tool_name: 5 }, created_at: 1 },
      stepEvent(understand),
      { event: 'RunCompleted', content: 'ok', created_at: 3 }
    ])

    expect(lastMessage.extra_data?.reasoning_steps).toEqual([understand])
    expect(lastMessage).toMatchObject({ content: 'ok', streamingError: false })
  })
})
