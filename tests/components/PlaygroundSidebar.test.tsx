import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import ChatInput from '@/components/playground/ChatArea/ChatInput'
import SessionBlankState from '@/components/playground/Sidebar/Sessions/SessionBlankState'
import Sidebar from '@/components/playground/Sidebar/Sidebar'
import { usePlaygroundStore } from '@/store'

import { renderWithIntl } from '../helpers/intl'

// P1-06: painel de sessões e agente (docs/design/P1-06.md, § 2 "Painel",
// V-P1-06-1/2/3/10/11).

const initialStoreState = usePlaygroundStore.getState()

const agents = [
  { value: 'suporte-n1', label: 'Suporte N1', model: { provider: 'Anthropic', model: 'claude-sonnet-4' }, storage: true },
  { value: 'agent-2', label: 'Pesquisador', model: { provider: 'Ollama', model: 'llama3.2' } }
]

const now = Math.floor(Date.now() / 1000)

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
  usePlaygroundStore.setState({
    isOrchestratorActive: true,
    isOrchestratorLoading: false,
    hasStorage: true,
    agents,
    sessionsData: [
      { session_id: 's1', title: 'Prazo de troca no app', created_at: now },
      { session_id: 's2', title: 'Cupom não aplicado', created_at: now - 86_400 },
      { session_id: 's3', title: 'Endereço errado', created_at: Date.UTC(2020, 9, 12, 15) / 1000 }
    ]
  })
})

const renderSidebar = (searchParams = '?agent=suporte-n1&session=s1', closeAction?: React.ReactNode) =>
  renderWithIntl(
    <NuqsTestingAdapter searchParams={searchParams}>
      <Sidebar closeAction={closeAction} />
    </NuqsTestingAdapter>
  )

const follows = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('painel', () => {
  it('na ordem: "Conversar com" + recolher, Agente | Team, cartão, Nova conversa e Sessões; sem Endpoint (V-P2-03-1)', () => {
    renderSidebar()

    const label = screen.getByText('Conversar com')
    expect(label).toHaveClass('font-mono', 'uppercase', 'text-muted-foreground')
    const collapse = screen.getByRole('button', { name: 'Recolher painel de sessões' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    const group = screen.getByRole('group', { name: 'Conversar com' })
    expect(within(group).getByRole('button', { name: 'Agente' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Team' })).toBeDisabled()
    const card = screen.getByRole('combobox', { name: 'Agente: Suporte N1' })
    expect(card).toHaveTextContent('SNSuporte N1Anthropic/claude-sonnet-4')
    const newChat = screen.getByRole('button', { name: 'Nova conversa' })
    const sessions = screen.getByText('Sessões')

    const order = [label, collapse, group, card, newChat, sessions]
    order.slice(1).forEach((element, index) => expect(follows(order[index], element)).toBe(true))
    expect(screen.queryByText('Agent UI')).not.toBeInTheDocument()
    expect(screen.queryByText('Modo')).not.toBeInTheDocument()
    expect(screen.queryByText('Endpoint')).not.toBeInTheDocument()
    expect(screen.queryByText(/localhost|7777/)).not.toBeInTheDocument()
    // A lista vai até o fim do painel: Sessões é o último bloco.
    expect(sessions.closest('aside')?.lastElementChild?.lastElementChild).toContainElement(sessions)
  })

  it('sem entidade selecionada: o cartão mostra "Selecione um agente", sem avatar', () => {
    renderSidebar('')

    const card = screen.getByRole('combobox')
    expect(card).toHaveTextContent('Selecione um agente')
    expect(card).not.toHaveAttribute('aria-label')
  })

  it('a lista do cartão traz avatar, nome e id', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('combobox', { name: 'Agente: Suporte N1' }))

    expect(await screen.findByRole('option', { name: /Pesquisador/ })).toHaveTextContent(
      'PEPesquisadoragent-2'
    )
  })

  it('recolher deixa só "Expandir painel de sessões"; o conteúdo sai da árvore', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Recolher painel de sessões' }))

    const expand = screen.getByRole('button', { name: 'Expandir painel de sessões' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(expand).toHaveFocus()
    expect(screen.getAllByRole('button')).toEqual([expand])
    expect(screen.getByText('Sessões')).not.toBeVisible()

    await user.click(expand)
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recolher painel de sessões' })).toHaveFocus()
  })

  // R1 (review do P1-06): com o composer na página, expandir não pode
  // remontar o cartão, que foca o composer ao montar.
  it('recolher e expandir com o composer montado: o foco fica no botão do painel', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=suporte-n1">
        <Sidebar />
        <ChatInput />
      </NuqsTestingAdapter>
    )
    const composer = screen.getByRole('textbox', { name: 'Mensagem para Suporte N1' })
    await waitFor(() => expect(composer).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Recolher painel de sessões' }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(screen.getByRole('button', { name: 'Expandir painel de sessões' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Expandir painel de sessões' }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(screen.getByRole('button', { name: 'Recolher painel de sessões' })).toHaveFocus()
  })

  // V-P2-03-2 (design QA): offline, só "Conversar com" + recolher; sem "Nova conversa".
  it('orquestrador fora: sem Agente | Team, cartão nem "Nova conversa"', () => {
    usePlaygroundStore.setState({ isOrchestratorActive: false, isOrchestratorLoading: false })
    renderSidebar()

    expect(screen.getByText('Conversar com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recolher painel de sessões' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nova conversa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Conversar com' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('no Sheet: a ação de fechar no lugar do recolher', () => {
    renderSidebar(undefined, <button type="button">Fechar</button>)

    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recolher painel de sessões' })).not.toBeInTheDocument()
  })
})

describe('sessões', () => {
  it('linha é botão com título e horário; a ativa tem aria-current', () => {
    renderSidebar()

    const active = screen.getByRole('button', { name: /^Prazo de troca no app/ })
    expect(active).toHaveAttribute('aria-current', 'true')
    expect(active).toHaveClass('bg-primary-soft', 'font-medium')
    expect(within(active).getByText(/^\d{2}:\d{2}$/)).toHaveClass('font-mono', 'tabular-nums')
    const other = screen.getByRole('button', { name: /^Cupom não aplicado/ })
    expect(other).not.toHaveAttribute('aria-current')
    expect(within(other).getByText('ontem')).toBeInTheDocument()
    expect(
      within(screen.getByRole('button', { name: /^Endereço errado/ })).getByText('12/10')
    ).toBeInTheDocument()
  })

  it('a lixeira vem logo depois da linha no Tab', async () => {
    const user = userEvent.setup()
    renderSidebar()

    screen.getByRole('button', { name: /^Prazo de troca no app/ }).focus()
    await user.tab()

    expect(
      screen.getByRole('button', { name: 'Excluir sessão "Prazo de troca no app"' })
    ).toHaveFocus()
  })

  // V-P2-03-10: abaixo de lg (toque, sem hover) a lixeira fica sempre
  // visível, 44×44, depois do horário; em lg+ volta ao hover do P1-06.
  it('lixeira: 44×44 visível abaixo de lg, 28 px no hover em lg+', () => {
    renderSidebar()

    const trash = screen.getByRole('button', { name: 'Excluir sessão "Prazo de troca no app"' })
    expect(trash).toHaveClass('size-11', 'lg:size-7', 'lg:opacity-0', 'lg:group-hover:opacity-100')
    expect(trash).not.toHaveClass('opacity-0')
    // o ícone em muted-foreground abaixo de lg (o Icon fixa text-foreground no svg)
    expect(trash.querySelector('svg')).toHaveClass('max-lg:text-muted-foreground')
    const time = within(screen.getByRole('button', { name: /^Prazo de troca no app/ })).getByText(
      /^\d{2}:\d{2}$/
    )
    expect(time).toHaveClass('lg:group-hover:invisible')
    expect(time).not.toHaveClass('group-hover:invisible')
  })

  it('EN: "yesterday"', () => {
    renderWithIntl(
      <NuqsTestingAdapter searchParams="?agent=suporte-n1">
        <Sidebar />
      </NuqsTestingAdapter>,
      { locale: 'en' }
    )

    expect(screen.getByText('yesterday')).toBeInTheDocument()
  })
})

describe('caixa de sessões vazia: ícones distintos', () => {
  const blank = (searchParams = '?agent=suporte-n1') =>
    renderWithIntl(
      <NuqsTestingAdapter searchParams={searchParams}>
        <SessionBlankState />
      </NuqsTestingAdapter>
    )

  it.each([
    ['offline', { isOrchestratorActive: false }, '?agent=suporte-n1', 'lucide-unplug'],
    ['sem entidade', {}, '', 'lucide-bot'],
    ['sem storage', { hasStorage: false }, '?agent=suporte-n1', 'lucide-database'],
    ['falha', { sessionsError: true }, '?agent=suporte-n1', 'lucide-circle-alert'],
    ['nenhuma sessão', { sessionsData: [] }, '?agent=suporte-n1', 'lucide-history']
  ])('%s: %s', (_, state, searchParams, icon) => {
    usePlaygroundStore.setState(state)
    const { container } = blank(searchParams)

    expect(container.querySelector('svg')).toHaveClass(icon)
  })
})
