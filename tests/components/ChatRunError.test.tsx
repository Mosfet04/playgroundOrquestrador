import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import ChatInput from '@/components/playground/ChatArea/ChatInput'
import MessageArea from '@/components/playground/ChatArea/MessageArea'
import type { AppLocale } from '@/i18n/locales'
import { usePlaygroundStore, type StreamingError } from '@/store'
import type { PlaygroundChatMessage } from '@/types/playground'

import { IntlProvider } from '../helpers/intl'
import { BFF } from '../msw/handlers'
import { server } from '../msw/server'

// QA1-03 (docs/design/QA1-03.md): o erro do run em frase por código, com
// "Detalhes técnicos" colapsável e Reenviar; a pergunta sem resposta de uma
// sessão reaberta, marcada e com Reenviar; markdown seguro na bolha do usuário.

const initialStoreState = usePlaygroundStore.getState()
const PYDANTIC =
  "1 validation error for GenerateContentConfig\ntemperature\n  Input should be a valid number [type=float_parsing, input_value='0,7', input_type=str]"

const question: PlaygroundChatMessage = { role: 'user', content: 'qual o prazo?', created_at: 1 }
const failedAnswer: PlaygroundChatMessage = {
  role: 'agent',
  content: '',
  streamingError: true,
  created_at: 2
}

const sse = (events: Record<string, unknown>[]) =>
  new HttpResponse(
    events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )

// A conversa e o composer, como na página: o Reenviar devolve o foco a ele.
const renderChat = (
  messages: PlaygroundChatMessage[],
  { error = null, locale = 'pt-BR' }: { error?: StreamingError | null; locale?: AppLocale } = {}
) => {
  usePlaygroundStore.setState({
    messages,
    streamingErrorMessage: error,
    mode: 'agent',
    agents: [{ value: 'agent-1', label: 'Assistente', model: { provider: 'OpenAI', model: 'gpt-4o' } }],
    isOrchestratorActive: true,
    isOrchestratorLoading: false
  })
  return render(
    <IntlProvider locale={locale}>
      <NuqsTestingAdapter searchParams="?agent=agent-1&session=s1">
        <MessageArea />
        <ChatInput />
      </NuqsTestingAdapter>
    </IntlProvider>
  )
}

// O POST do run: guarda os corpos e responde com a resposta completa.
const runRequests = () => {
  const bodies: unknown[] = []
  server.use(
    http.post(`${BFF}/agents/agent-1/runs`, async ({ request }) => {
      bodies.push(await request.json())
      return sse([
        { event: 'RunStarted', session_id: 's1', created_at: 3 },
        { event: 'RunCompleted', content: 'Até 08/11.', created_at: 4 }
      ])
    })
  )
  return bodies
}

const errorBlock = () => screen.getByRole('group', { name: 'Erro na resposta' })

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.scrollIntoView = () => undefined
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('erro do run na bolha do agente', () => {
  it('overloaded: frase por código em destructive, como alerta; o detalhe fica fechado', () => {
    renderChat([question, failedAnswer], {
      error: { kind: 'overloaded', detail: '503 UNAVAILABLE high demand' }
    })

    const alert = within(errorBlock()).getByRole('alert')
    expect(alert).toHaveTextContent('O modelo está sobrecarregado. Tente de novo em instantes.')
    expect(alert).toHaveClass('text-destructive')
    expect(screen.queryByText('503 UNAVAILABLE high demand')).not.toBeVisible()
    expect(screen.queryByText(/Algo deu errado/)).not.toBeInTheDocument()
  })

  it('"Detalhes técnicos" abre e fecha pelo clique e pelo teclado, com aria-expanded e aria-controls', async () => {
    const user = userEvent.setup()
    renderChat([question, failedAnswer], {
      error: { kind: 'overloaded', detail: '503 UNAVAILABLE high demand' }
    })
    const toggle = screen.getByRole('button', { name: 'Detalhes técnicos' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Detalhes técnicos' })).toBeNull()

    await user.click(toggle)
    const panel = screen.getByRole('region', { name: 'Detalhes técnicos' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveTextContent('503 UNAVAILABLE high demand')
    expect(panel).toHaveClass('font-mono', 'text-xs', 'bg-muted', 'border-border', 'max-h-48', 'overflow-y-auto')

    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('invalidParam: cita o parâmetro em mono; o texto pydantic só no painel', () => {
    renderChat([question, failedAnswer], {
      error: { kind: 'invalidParam', param: 'temperature', detail: PYDANTIC }
    })

    const alert = within(errorBlock()).getByRole('alert')
    expect(alert).toHaveTextContent(
      'O modelo recusou o parâmetro temperature. Ajuste-o na configuração do agente.'
    )
    expect(within(alert).getByText('temperature')).toHaveClass('font-mono')
    expect(screen.queryByText(/validation error/)).not.toBeVisible()
  })

  it('other e EN: a frase própria, sem o prefixo antigo', () => {
    renderChat([question, failedAnswer], { error: { kind: 'other' }, locale: 'en' })

    expect(within(screen.getByRole('group', { name: 'Response error' })).getByRole('alert')).toHaveTextContent(
      "The model couldn't respond. See the technical details."
    )
    // Sem detalhe, sem o colapsável.
    expect(screen.queryByRole('button', { name: 'Technical details' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Resend' })).toBeInTheDocument()
  })

  it.each<[StreamingError | null, boolean]>([
    [{ kind: 'overloaded' }, true],
    [{ kind: 'invalidParam', param: 'top_p' }, true],
    [{ kind: 'other' }, true],
    [{ kind: 'runError' }, true],
    [{ kind: 'unavailable' }, true],
    [{ kind: 'network' }, true],
    [{ kind: 'interrupted' }, true],
    [null, true],
    [{ kind: 'cancelled' }, false],
    [{ kind: 'noEntity' }, false],
    [{ kind: 'sessionNotOwned' }, false]
  ])('%o: Reenviar %s', (error, shown) => {
    renderChat([question, failedAnswer], { error })

    expect(screen.queryAllByRole('button', { name: 'Reenviar' })).toHaveLength(shown ? 1 : 0)
  })

  it('Reenviar manda a mesma mensagem na mesma sessão, troca a bolha de erro e não duplica a pergunta', async () => {
    const user = userEvent.setup()
    const bodies = runRequests()
    renderChat([question, failedAnswer], { error: { kind: 'overloaded', detail: 'high demand' } })

    await user.click(screen.getByRole('button', { name: 'Reenviar' }))

    expect(await screen.findByText('Até 08/11.')).toBeInTheDocument()
    expect(bodies).toEqual([{ message: 'qual o prazo?', session_id: 's1' }])
    expect(screen.getAllByText('qual o prazo?')).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Erro na resposta' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Mensagem para Assistente' })).toHaveFocus()
  })

  // O dblClick no mesmo botão não prova o guard: a bolha some no 1º clique e o
  // 2º cai no vazio (QA: com o guard removido este teste seguia verde). O que
  // o guard segura é o 2º Reenviar de OUTRA marca, clicado com o 1º run aberto.
  it('Reenviar em duas marcas em seguida manda um run só (o guard do isStreaming)', async () => {
    const user = userEvent.setup()
    const bodies: unknown[] = []
    server.use(
      http.post(`${BFF}/agents/agent-1/runs`, async ({ request }) => {
        bodies.push(await request.json())
        // Run que não termina sozinho: o isStreaming fica ligado no 2º clique.
        return new HttpResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: RunStarted\ndata: ${JSON.stringify({ event: 'RunStarted', session_id: 's1', created_at: 3 })}\n\n`
                )
              )
            }
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        )
      })
    )
    renderChat([question, { role: 'user', content: 'e agora?', created_at: 2 }])

    await user.click(screen.getAllByRole('button', { name: 'Reenviar' })[0])
    // A conversa se reordena (a pergunta reenviada vai para o fim): o botão que
    // sobra é o da outra marca, aria-disabled, e o clique é ignorado.
    const other = screen.getByRole('button', { name: 'Reenviar' })
    expect(other).toHaveAttribute('aria-disabled', 'true')
    await user.click(other)

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies).toEqual([{ message: 'qual o prazo?', session_id: 's1' }])
  })
})

describe('Reenviar com outro stream em andamento', () => {
  it('fica aria-disabled com o motivo e o clique não manda nada', async () => {
    const user = userEvent.setup()
    const bodies = runRequests()
    renderChat([question, { role: 'user', content: 'outra', created_at: 2 }, { ...failedAnswer, streamingError: false, created_at: 3 }])
    act(() => usePlaygroundStore.setState({ isStreaming: true }))

    const resend = screen.getByRole('button', { name: 'Reenviar' })
    expect(resend).toHaveAttribute('aria-disabled', 'true')
    expect(resend).toHaveAccessibleDescription('Aguarde a resposta terminar.')
    expect(resend).toHaveAttribute('title', 'Aguarde a resposta terminar.')
    expect(resend).not.toBeDisabled()

    await user.click(resend)

    expect(bodies).toEqual([])
    expect(screen.getAllByText('qual o prazo?')).toHaveLength(1)
  })
})

describe('pergunta sem resposta na sessão reaberta', () => {
  // A bolha e o que vem abaixo dela (a marca).
  const mark = (bubbleText: string) =>
    screen.getByText(bubbleText).closest('.bg-primary-soft')!.parentElement as HTMLElement

  it('a última sem resposta: "sem resposta" com ícone e Reenviar, abaixo da bolha', () => {
    renderChat([
      { role: 'user', content: 'oi', created_at: 1 },
      { role: 'agent', content: 'Olá!', created_at: 2 },
      question
    ])

    const last = mark('qual o prazo?')
    expect(within(last).getByText('sem resposta')).toHaveClass('text-muted-foreground')
    expect(within(last).getByText('sem resposta').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(within(last).getByRole('button', { name: 'Reenviar' })).toBeInTheDocument()
    expect(within(mark('oi')).queryByText('sem resposta')).toBeNull()
    expect(screen.getAllByText('sem resposta')).toHaveLength(1)
  })

  it('duas do usuário seguidas: marca a primeira', () => {
    renderChat([question, { role: 'user', content: 'e agora?', created_at: 2 }, { role: 'agent', content: 'Até 08/11.', created_at: 3 }])

    expect(within(mark('qual o prazo?')).getByText('sem resposta')).toBeInTheDocument()
    expect(within(mark('e agora?')).queryByText('sem resposta')).toBeNull()
  })

  it('pergunta respondida e erro ao vivo não ganham a marca', () => {
    renderChat([question, failedAnswer], { error: { kind: 'overloaded' } })

    expect(screen.queryByText('sem resposta')).toBeNull()
  })

  it('Reenviar na marca: mesma mensagem e sessão; a pergunta não duplica e a marca sai com a resposta', async () => {
    const user = userEvent.setup()
    const bodies = runRequests()
    renderChat([question, { role: 'user', content: 'e agora?', created_at: 2 }, { role: 'agent', content: 'Depois.', created_at: 3 }])

    await user.click(within(mark('qual o prazo?')).getByRole('button', { name: 'Reenviar' }))

    expect(await screen.findByText('Até 08/11.')).toBeInTheDocument()
    expect(bodies).toEqual([{ message: 'qual o prazo?', session_id: 's1' }])
    expect(screen.getAllByText('qual o prazo?')).toHaveLength(1)
    expect(screen.queryByText('sem resposta')).toBeNull()
  })
})

describe('markdown na bolha do usuário', () => {
  const userBubble = (content: string) => {
    renderChat([{ role: 'user', content, created_at: 1 }, { role: 'agent', content: 'ok', created_at: 2 }])
    return document.querySelector('.bg-primary-soft') as HTMLElement
  }

  it('crases, bloco de código e lista renderizam; código com fundo card e borda', () => {
    const bubble = userBubble('Use `pnpm test` e:\n\n```\nSELECT 1;\n```\n\n- um\n- dois')

    const inline = within(bubble).getByText('pnpm test')
    expect(inline.tagName).toBe('CODE')
    expect(within(bubble).getByText('SELECT 1;').closest('pre')).not.toBeNull()
    expect(within(bubble).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['um', 'dois'])
    expect(bubble.firstElementChild).toHaveClass('[&_code]:bg-card', '[&_code]:border-border', '[&_a]:text-primary')
  })

  it('quebra de linha simples continua visível', () => {
    const bubble = userBubble('linha 1\nlinha 2')

    expect(bubble.firstElementChild).toHaveClass('[&_div]:whitespace-pre-wrap')
    expect(bubble).toHaveTextContent('linha 1\nlinha 2', { normalizeWhitespace: false })
  })

  // Review N1: a quebra forçada do markdown (dois espaços) vira `<br>` e mais
  // a quebra de linha que o pre-wrap mostra: o `<br>` sai, sobra uma quebra.
  it('quebra forçada não dá linha em branco a mais', () => {
    const bubble = userBubble('linha 1  \nlinha 2')

    expect(bubble.querySelector('br')).not.toBeNull()
    expect(bubble).toHaveTextContent('linha 1\nlinha 2', { normalizeWhitespace: false })
    expect(bubble.firstElementChild).toHaveClass('[&_div_br]:hidden')
  })

  // Review D3: no item de lista compacta (sem pre-wrap) o `<br>` é a quebra.
  it('quebra forçada no item de lista fica (só o `<br>` do parágrafo some)', () => {
    const bubble = userBubble('- item 1  \n  continua')

    const item = within(bubble).getByRole('listitem')
    expect(item.querySelector('br')).not.toBeNull()
    expect(item.closest('div')).toBe(bubble.firstElementChild)
    expect(bubble.firstElementChild).not.toHaveClass('[&_br]:hidden')
  })

  it('HTML cru e javascript: viram texto, sem tag nem link', () => {
    const bubble = userBubble('<b>oi</b> <script>window.__pwned=1</script> [x](javascript:alert(1))')

    expect(bubble.querySelector('b, script, a')).toBeNull()
    expect(bubble).toHaveTextContent('<b>oi</b> <script>window.__pwned=1</script> x')
    expect(window).not.toHaveProperty('__pwned')
  })
})
