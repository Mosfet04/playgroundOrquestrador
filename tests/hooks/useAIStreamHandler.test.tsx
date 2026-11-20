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
