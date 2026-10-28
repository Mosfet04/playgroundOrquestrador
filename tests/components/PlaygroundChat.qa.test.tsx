import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import ChatInput from '@/components/playground/ChatArea/ChatInput'
import Messages from '@/components/playground/ChatArea/Messages/Messages'
import Sidebar from '@/components/playground/Sidebar/Sidebar'
import { usePlaygroundStore } from '@/store'
import type { PlaygroundChatMessage, ToolCall } from '@/types/playground'

import { renderWithIntl } from '../helpers/intl'
import { BFF } from '../msw/handlers'
import { server } from '../msw/server'

// QA P1-06: o que o dev não cobriu. Dado hostil do orquestrador (duração nula
// ou não numérica, data inválida na sessão, nome de agente com HTML), regras
// do composer (Enter) e o chip depois de um stream interrompido.
// Complementa PlaygroundChat.test.tsx e PlaygroundSidebar.test.tsx.

const initialStoreState = usePlaygroundStore.getState()

const entity = { id: 'suporte-n1', name: 'Suporte N1', model: 'claude-sonnet-4' }
const tool = (name: string, extra: Record<string, unknown> = {}) =>
  ({ tool_call_id: name, tool_name: name, tool_args: {}, created_at: 1, ...extra }) as unknown as ToolCall
const agentMessage = (extra: Partial<PlaygroundChatMessage> = {}): PlaygroundChatMessage => ({
  role: 'agent',
  content: 'ok',
  created_at: 2,
  ...extra
})
const renderMessages = (messages: PlaygroundChatMessage[], streaming = false) => {
  usePlaygroundStore.setState({ isStreaming: streaming })
  return renderWithIntl(<Messages messages={messages} entity={entity} />)
}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('chip de tool: duração hostil', () => {
  // BUG-P1-06-2 (corrigido): `duration: null` passa por `=== undefined` e vira
  // número (Intl formata null como 0): a tool em curso aparece concluída em
  // "0 s". Idem string não numérica ("NaN s"). Desde o P2-03 o stream passa
  // por zod (useAIResponseStream); o chip segue defensivo para o histórico.
  it('BUG-P1-06-2: duração nula no stream: continua "executando"', () => {
    renderMessages([agentMessage({ tool_calls: [tool('t', { metrics: { duration: null } })] })], true)

    expect(screen.getByText('executando')).toBeInTheDocument()
  })

  it('BUG-P1-06-2: duração nula depois do stream: concluída sem tempo inventado ("0 s")', () => {
    renderMessages([agentMessage({ tool_calls: [tool('t', { metrics: { duration: null } })] })])

    const chip = screen.getByRole('listitem')
    expect(chip).toHaveTextContent(/^tconcluída$/) // nome + sr-only, sem tempo
    expect(chip).not.toHaveAttribute('title')
  })

  it('duração 0 é um tempo válido: "0 s"', () => {
    renderMessages([agentMessage({ tool_calls: [tool('t', { metrics: { duration: 0 } })] })])

    expect(screen.getByRole('listitem')).toHaveTextContent('t0 sconcluída')
  })

  it('BUG-P1-06-2: duração não numérica ("abc") não vira "NaN s"', () => {
    renderMessages([agentMessage({ tool_calls: [tool('t', { metrics: { duration: 'abc' } })] })])

    expect(screen.getByRole('listitem')).toHaveTextContent(/^tconcluída$/)
  })

  it('nome de tool com HTML aparece como texto', () => {
    const { container } = renderMessages([
      agentMessage({ tool_calls: [tool('<img src=x onerror=alert(1)>', { metrics: { duration: 1 } })] })
    ])

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  // Observação (não é defeito pela spec: "executando" = stream ativo e sem
  // duração): depois de um stream interrompido, a tool que nunca terminou
  // aparece como "concluída" com o check verde.
  it('stream interrompido com tool sem duração: hoje aparece "concluída"', () => {
    renderMessages([agentMessage({ streamingError: true, tool_calls: [tool('t')] })])

    expect(screen.getByRole('listitem')).toHaveTextContent('concluída')
  })
})

describe('entidade com nome hostil', () => {
  const hostile = '<img src=x onerror="window.__pwned=1"> Alfa'

  it('resposta e cartão mostram o nome como texto, com iniciais', () => {
    usePlaygroundStore.setState({
      isOrchestratorActive: true,
      isOrchestratorLoading: false,
      agents: [{ value: 'a1', label: hostile, model: { provider: 'x', model: 'm' } }]
    })
    const { container } = renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=a1">
        <Sidebar />
        <Messages messages={[agentMessage()]} entity={{ id: 'a1', name: hostile, model: 'm' }} />
      </NuqsTestingAdapter>
    )

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getAllByText(hostile).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('combobox', { name: `Agente: ${hostile}` })).toBeInTheDocument()
  })
})

describe('sessão com data inválida', () => {
  const renderPanel = (created_at: unknown) => {
    usePlaygroundStore.setState({
      isOrchestratorActive: true,
      isOrchestratorLoading: false,
      hasStorage: true,
      agents: [{ value: 'suporte-n1', label: 'Suporte N1', model: { provider: 'x' }, storage: true }],
      sessionsData: [{ session_id: 's1', title: 'Conversa sem data', created_at: created_at as number }]
    })
    return renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=suporte-n1">
        <Sidebar />
      </NuqsTestingAdapter>
    )
  }

  // BUG-P1-06-1 (corrigido): `format.dateTime(new Date(NaN))` do use-intl não
  // lança, devolve "Invalid Date", que aparecia como horário na linha. O
  // orquestrador pode mandar `created_at` ausente ou texto que não é data
  // (desde a P2-03 o BFF já troca por 0, tests/app/api/playgroundChat.test.ts).
  it.each([[Number.NaN], [undefined], [1e20]])(
    'BUG-P1-06-1: created_at %s: a linha fica sem horário, não "Invalid Date"',
    (createdAt) => {
      renderPanel(createdAt)

      // nome exato: com "Invalid Date" no horário o nome seria outro
      expect(screen.getByRole('button', { name: 'Conversa sem data' })).toBeInTheDocument()
      expect(document.body).not.toHaveTextContent(/Invalid/)
    }
  )
})

describe('composer: Enter', () => {
  let runs: number
  beforeEach(() => {
    runs = 0
    usePlaygroundStore.setState({
      isOrchestratorActive: true,
      isOrchestratorLoading: false,
      agents: [{ value: 'agent-1', label: 'Assistente', model: { provider: 'OpenAI', model: 'gpt-4o' } }]
    })
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, () => {
        runs += 1
        return new HttpResponse(
          'event: RunContent\ndata: {"event":"RunContent","content":"ok","content_type":"str","created_at":1}\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } }
        )
      })
    )
  })
  const renderComposer = () =>
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=agent-1">
        <ChatInput />
      </NuqsTestingAdapter>
    )
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 150)))

  it('Enter envia uma vez e limpa o campo', async () => {
    const user = userEvent.setup()
    renderComposer()
    const box = screen.getByRole('textbox', { name: 'Mensagem para Assistente' })

    await user.type(box, 'oi{Enter}')
    await settle()

    await waitFor(() => expect(runs).toBe(1))
    expect(box).toHaveValue('')
    expect(usePlaygroundStore.getState().messages[0]).toMatchObject({ role: 'user', content: 'oi' })
  })

  it('só espaços: Enter não envia e Enviar diz "escreva uma mensagem"', async () => {
    const user = userEvent.setup()
    renderComposer()

    await user.type(screen.getByRole('textbox'), '   {Enter}')
    await settle()

    expect(usePlaygroundStore.getState().messages).toHaveLength(0)
    expect(runs).toBe(0)
    expect(screen.getByRole('button', { name: 'Enviar mensagem (escreva uma mensagem)' })).toBeDisabled()
  })

  it('Shift+Enter quebra a linha sem enviar', async () => {
    const user = userEvent.setup()
    renderComposer()
    const box = screen.getByRole('textbox')

    await user.type(box, 'a{Shift>}{Enter}{/Shift}b')
    await settle()

    expect(usePlaygroundStore.getState().messages).toHaveLength(0)
    expect(runs).toBe(0)
    expect(box).toHaveValue('a\nb')
  })

  it('Enter durante a composição (IME) não envia', async () => {
    const user = userEvent.setup()
    renderComposer()
    const box = screen.getByRole('textbox')
    await user.type(box, 'こんにちは')

    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    await settle()

    expect(usePlaygroundStore.getState().messages).toHaveLength(0)
    expect(runs).toBe(0)
    expect(box).toHaveValue('こんにちは')
  })

  it('durante o stream o Enter não envia a 2ª mensagem', async () => {
    const user = userEvent.setup()
    renderComposer()
    const box = screen.getByRole('textbox')
    act(() => usePlaygroundStore.setState({ isStreaming: true }))

    await user.type(box, 'segunda{Enter}')
    await settle()

    expect(runs).toBe(0)
    expect(usePlaygroundStore.getState().messages).toHaveLength(0)
  })

  it('clicar em Enviar com o campo vazio não faz nada', async () => {
    const user = userEvent.setup()
    renderComposer()

    await user.click(screen.getByRole('button', { name: 'Enviar mensagem (escreva uma mensagem)' }))
    await settle()

    expect(usePlaygroundStore.getState().messages).toHaveLength(0)
    expect(runs).toBe(0)
  })
})
