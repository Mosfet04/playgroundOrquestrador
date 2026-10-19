import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import ChatInput from '@/components/playground/ChatArea/ChatInput'
import MessageArea from '@/components/playground/ChatArea/MessageArea'
import ChatBlankState from '@/components/playground/ChatArea/Messages/ChatBlankState'
import Messages from '@/components/playground/ChatArea/Messages/Messages'
import type { SelectedEntity } from '@/hooks/useSelectedEntity'
import type { AppLocale } from '@/i18n/locales'
import { usePlaygroundStore } from '@/store'
import type { PlaygroundChatMessage, ToolCall } from '@/types/playground'

import { IntlProvider, renderWithIntl } from '../helpers/intl'

// P1-06: a conversa no visual do Design System (docs/design/P1-06.md, § 2 e
// § 6): chip de tool call, indicador de stream, métricas, composer e anúncios.

const initialStoreState = usePlaygroundStore.getState()

const entity: SelectedEntity = {
  id: 'suporte-n1',
  name: 'Suporte N1',
  model: 'claude-sonnet-4'
}

const tool = (name: string, extra: Partial<ToolCall> = {}): ToolCall =>
  ({ tool_call_id: name, tool_name: name, tool_args: {}, created_at: 1, ...extra }) as ToolCall

const agentMessage = (extra: Partial<PlaygroundChatMessage> = {}): PlaygroundChatMessage => ({
  role: 'agent',
  content: 'A troca vale até 08/11.',
  created_at: 2,
  ...extra
})

const renderMessages = (messages: PlaygroundChatMessage[], locale: AppLocale = 'pt-BR') =>
  renderWithIntl(<Messages messages={messages} entity={entity} />, { locale })

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('chip de tool call', () => {
  const chips = () =>
    within(screen.getByRole('list', { name: 'Chamadas de tool' })).getAllByRole('listitem')

  it('concluída: nome, tempo com até 2 casas, check e "concluída" para leitor de tela', () => {
    renderMessages([
      agentMessage({ tool_calls: [tool('consultar_pedido', { metrics: { duration: 0.18 } })] })
    ])

    const [chip] = chips()
    expect(chip).toHaveTextContent('consultar_pedido0,18 sconcluída')
    expect(chip).toHaveAttribute('title', 'Tool concluída em 0,18 s')
    expect(within(chip).getByText('concluída')).toHaveClass('sr-only')
    expect(chip.querySelector('.lucide-wrench')).toHaveClass('text-signal')
    expect(chip.querySelector('.lucide-check')).toHaveClass('text-success')
  })

  it('com erro: "erro" em destructive, sem tempo, title "Tool falhou"', () => {
    renderMessages([
      agentMessage({
        tool_calls: [tool('abrir_troca', { tool_call_error: true, metrics: { duration: 0.05 } })]
      })
    ])

    const [chip] = chips()
    expect(chip).toHaveTextContent('abrir_trocaerro')
    expect(chip).toHaveAttribute('title', 'Tool falhou')
    expect(within(chip).getByText('erro')).toHaveClass('text-destructive')
    expect(chip.querySelector('.lucide-circle-x')).toHaveClass('text-destructive')
    expect(chip.firstElementChild).toHaveClass('border-destructive')
  })

  it('executando: no stream e sem duração, ponto signal e "executando"; no fim, concluída', () => {
    usePlaygroundStore.setState({ isStreaming: true })
    const messages = [agentMessage({ content: '', tool_calls: [tool('abrir_troca')] })]
    const { rerender } = renderMessages(messages)

    const [chip] = chips()
    expect(chip).toHaveTextContent('abrir_trocaexecutando')
    // Design QA do P1-06: o ponto não encosta no nome.
    expect(chip.querySelector('.live-dot')).toHaveClass('text-signal', 'ml-1')
    expect(chip).not.toHaveAttribute('title')

    act(() => usePlaygroundStore.setState({ isStreaming: false }))
    rerender(
      <IntlProvider>
        <Messages messages={messages} entity={entity} />
      </IntlProvider>
    )
    expect(chips()[0]).toHaveTextContent('abrir_trocaconcluída')
  })

  it('EN: "done", "error", "running" e o tempo com ponto', () => {
    usePlaygroundStore.setState({ isStreaming: true })
    renderMessages(
      [
        agentMessage({
          tool_calls: [
            tool('a', { metrics: { duration: 0.183 } }),
            tool('b', { tool_call_error: true }),
            tool('c')
          ]
        })
      ],
      'en'
    )

    const list = screen.getByRole('list', { name: 'Tool calls' })
    const [done, error, running] = within(list).getAllByRole('listitem')
    expect(done).toHaveTextContent('a0.18 sdone')
    expect(done).toHaveAttribute('title', 'Tool finished in 0.18 s')
    expect(error).toHaveTextContent('berror')
    expect(error).toHaveAttribute('title', 'Tool failed')
    expect(running).toHaveTextContent('crunning')
  })

  it('sem o ícone de martelo antes dos chips', () => {
    renderMessages([agentMessage({ tool_calls: [tool('a')] })])

    expect(document.querySelector('.lucide-hammer, [data-icon="hammer"]')).toBeNull()
  })
})

describe('resposta do agente', () => {
  it('nome e modelo da entidade, texto e a linha de métricas', () => {
    renderMessages([
      { role: 'user', content: 'Qual o prazo?', created_at: 1 },
      agentMessage({ metrics: { duration: 1.4, input_tokens: 600, output_tokens: 212 } })
    ])

    expect(screen.getByText('Suporte N1')).toHaveClass('font-medium')
    expect(screen.getByText('claude-sonnet-4')).toHaveClass('font-mono')
    // 16/24 no texto do markdown (V-P1-06-4), sem o tracking de −0.02em.
    const text = screen.getByText('A troca vale até 08/11.')
    expect(text).toHaveClass('text-base', 'leading-6')
    expect(text.className).not.toMatch(/tracking-|text-\[0\.875rem\]/)
    expect(screen.getByText('1,4 s · 812 tokens')).toHaveClass('font-mono', 'text-muted-foreground')
    expect(screen.getByText('Qual o prazo?')).toHaveClass('bg-primary-soft')
  })

  it('markdown: lista em 16/24; negrito, ênfase e link herdam o tamanho do bloco', () => {
    renderMessages([
      agentMessage({ content: '**negrito**, *ênfase* e [link](https://x.test)\n\n- item' })
    ])

    expect(screen.getByText('item').closest('ul')).toHaveClass('text-base', 'leading-6')
    for (const inline of ['negrito', 'ênfase', 'link'])
      expect(screen.getByText(inline).className).not.toMatch(/\btext-(xs|sm|base)\b/)
  })

  it('EN: "1.4 s · 1,204 tokens"', () => {
    renderMessages(
      [agentMessage({ metrics: { duration: 1.44, input_tokens: 1000, output_tokens: 204 } })],
      'en'
    )

    expect(screen.getByText('1.4 s · 1,204 tokens')).toBeInTheDocument()
  })

  it.each([
    [{ duration: 2 }, '2,0 s'],
    [{ input_tokens: 10, output_tokens: 2 }, '12 tokens']
  ])('métricas parciais %o: só o pedaço com dado', (metrics, text) => {
    renderMessages([agentMessage({ metrics })])

    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('sem métricas, a linha não aparece', () => {
    const { container } = renderMessages([agentMessage()])

    expect(screen.queryByText(/ s$|tokens/)).not.toBeInTheDocument()
    expect(container.querySelector('.stream-caret')).toBeNull()
  })
})

describe('indicador de stream', () => {
  it('antes do 1º token: nome, cursor e "gerando", sem os 3 pontos', () => {
    usePlaygroundStore.setState({ isStreaming: true })
    const { container } = renderMessages([agentMessage({ content: '' })])

    expect(screen.getByText('Suporte N1')).toBeInTheDocument()
    expect(container.querySelector('.stream-caret')).not.toBeNull()
    expect(screen.getByText('gerando')).toHaveClass('text-signal')
    expect(container.querySelector('.animate-bounce')).toBeNull()
  })

  it('no meio do texto: cursor no fim do markdown e "gerando" no lugar das métricas', () => {
    usePlaygroundStore.setState({ isStreaming: true })
    const { container } = renderMessages([
      agentMessage({ content: 'Tentando', metrics: { duration: 1 } })
    ])

    expect(container.querySelector('.stream-caret')).toHaveTextContent('Tentando')
    expect(screen.getByText('gerando')).toBeInTheDocument()
    expect(screen.queryByText('1,0 s')).not.toBeInTheDocument()
  })

  it('só a última resposta fica em stream', () => {
    usePlaygroundStore.setState({ isStreaming: true })
    renderMessages([
      agentMessage({ metrics: { duration: 1 } }),
      { role: 'user', content: 'de novo', created_at: 3 },
      agentMessage({ content: '', created_at: 4 })
    ])

    expect(screen.getAllByText('gerando')).toHaveLength(1)
    expect(screen.getByText('1,0 s')).toBeInTheDocument()
  })

  it('erro do stream: o texto destructive, sem cursor, sem "gerando" e sem métricas', () => {
    usePlaygroundStore.setState({ isStreaming: true, streamingErrorMessage: { kind: 'network' } })
    const { container } = renderMessages([
      agentMessage({ content: '', streamingError: true, metrics: { duration: 1 } })
    ])

    expect(
      screen.getByText('Algo deu errado durante a resposta. Sem resposta do endpoint.')
    ).toHaveClass('text-destructive')
    expect(container.querySelector('.stream-caret')).toBeNull()
    expect(screen.queryByText('gerando')).not.toBeInTheDocument()
    expect(screen.queryByText('1,0 s')).not.toBeInTheDocument()
  })
})

describe('log da conversa e anúncio do stream', () => {
  const area = () =>
    render(
      <IntlProvider>
        <NuqsTestingAdapter searchParams="?agent=agent-1">
          <MessageArea />
        </NuqsTestingAdapter>
      </IntlProvider>
    )

  it('aria-busy no stream e o status diz início e fim, uma vez cada', () => {
    usePlaygroundStore.setState({
      agents: [{ value: 'agent-1', label: 'Assistente', model: { provider: 'OpenAI', model: 'gpt-4o' } }],
      messages: [{ role: 'user', content: 'oi', created_at: 1 }]
    })
    area()

    const log = screen.getByRole('log')
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(log).not.toHaveAttribute('aria-busy')
    const status = screen.getByRole('status')
    expect(status).toHaveClass('sr-only')
    expect(status).toBeEmptyDOMElement()

    act(() =>
      usePlaygroundStore.setState({
        isStreaming: true,
        messages: [
          { role: 'user', content: 'oi', created_at: 1 },
          { role: 'agent', content: '', created_at: 2 }
        ]
      })
    )
    expect(log).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Assistente está respondendo…')
    expect(screen.queryByText('Assistente está respondendo…', { selector: '[role="log"] *' })).toBeNull()

    act(() => usePlaygroundStore.setState({ isStreaming: false }))
    expect(log).not.toHaveAttribute('aria-busy')
    expect(status).toHaveTextContent('Resposta de Assistente concluída')
  })
})

// R2 (review do P1-06): o "concluída" é da resposta que terminou bem e do
// agente que respondeu.
describe('anúncio do stream: casos de borda', () => {
  const agents = [
    { value: 'a1', label: 'Alfa', model: { provider: 'x' } },
    { value: 'a2', label: 'Beta', model: { provider: 'x' } }
  ]
  const areaAt = (searchParams: string) => (
    <IntlProvider>
      <NuqsTestingAdapter searchParams={searchParams}>
        <MessageArea />
      </NuqsTestingAdapter>
    </IntlProvider>
  )
  const stream = (last: PlaygroundChatMessage) => {
    act(() =>
      usePlaygroundStore.setState({
        isStreaming: true,
        messages: [{ role: 'user', content: 'oi', created_at: 1 }, { ...last, streamingError: false }]
      })
    )
    act(() =>
      usePlaygroundStore.setState({
        isStreaming: false,
        messages: [{ role: 'user', content: 'oi', created_at: 1 }, last]
      })
    )
  }

  it('trocar de agente depois de uma resposta não anuncia "concluída" com o novo nome', () => {
    usePlaygroundStore.setState({ agents })
    const { rerender } = render(areaAt('?agent=a1'))
    stream(agentMessage())
    expect(screen.getByRole('status')).toHaveTextContent('Resposta de Alfa concluída')

    rerender(areaAt('?agent=a2'))

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('erro do stream: não anuncia "concluída"', () => {
    usePlaygroundStore.setState({ agents })
    render(areaAt('?agent=a1'))
    stream(agentMessage({ content: '', streamingError: true }))

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('composer', () => {
  const renderComposer = (searchParams = '?agent=agent-1') =>
    render(
      <IntlProvider>
        <NuqsTestingAdapter searchParams={searchParams}>
          <ChatInput />
        </NuqsTestingAdapter>
      </IntlProvider>
    )

  const online = () =>
    usePlaygroundStore.setState({
      isEndpointActive: true,
      isEndpointLoading: false,
      agents: [{ value: 'agent-1', label: 'Assistente', model: { provider: 'OpenAI', model: 'gpt-4o' } }]
    })

  it('com entidade: rótulo, placeholder, chip "para {id}", dica e Enviar com o motivo', async () => {
    online()
    const user = userEvent.setup()
    renderComposer()

    const textbox = screen.getByRole('textbox', { name: 'Mensagem para Assistente' })
    expect(textbox).toHaveAttribute('placeholder', 'Escreva uma mensagem para Assistente')
    expect(screen.getByText('para').parentElement).toHaveTextContent('para agent-1')
    expect(screen.getByText('Enter envia · Shift+Enter quebra linha')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enviar mensagem (escreva uma mensagem)' })
    ).toBeDisabled()

    await user.type(textbox, 'oi')
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeEnabled()

    act(() => usePlaygroundStore.setState({ isStreaming: true }))
    expect(
      screen.getByRole('button', { name: 'Enviar mensagem (aguarde a resposta terminar)' })
    ).toBeDisabled()
    expect(textbox).toBeEnabled()
  })

  it.each([
    [
      'offline',
      { isEndpointActive: false, isEndpointLoading: false },
      'Conecte o orquestrador para conversar',
      'Enviar mensagem (orquestrador desconectado)'
    ],
    [
      'conectando',
      { isEndpointActive: false, isEndpointLoading: true },
      'Escreva uma mensagem para agent-1',
      'Enviar mensagem (orquestrador desconectado)'
    ]
  ])('%s: textarea desabilitado, sem o chip "para"', (_, state, placeholder, send) => {
    usePlaygroundStore.setState(state)
    renderComposer()

    expect(screen.getByPlaceholderText(placeholder)).toBeDisabled()
    expect(screen.queryByText('para')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: send })).toBeDisabled()
  })

  it('sem entidade: placeholder do P1-05 e o motivo no Enviar', () => {
    online()
    renderComposer('')

    expect(screen.getByPlaceholderText('Selecione um agente ou team para conversar')).toBeDisabled()
    expect(screen.queryByText('para')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enviar mensagem (selecione um agente ou team)' })
    ).toBeDisabled()
  })
})

describe('conversa vazia', () => {
  it('avatar de 40 px com as iniciais do agente', () => {
    usePlaygroundStore.setState({
      isEndpointLoading: false,
      isEndpointActive: true,
      agents: [{ value: 'suporte-n1', label: 'Suporte N1', model: { provider: 'Anthropic' } }]
    })
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=suporte-n1">
        <ChatBlankState />
      </NuqsTestingAdapter>
    )

    const avatar = screen.getByText('SN')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar).toHaveClass('size-10')
  })
})
