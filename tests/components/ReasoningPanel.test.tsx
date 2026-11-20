import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import Messages from '@/components/playground/ChatArea/Messages/Messages'
import type { PlaygroundChatMessage, ReasoningSteps, ToolCall } from '@/types/playground'

import { renderWithIntl } from '../helpers/intl'

// AG3-04: o painel de raciocínio do agente (docs/design/AG3-04.md, § 3).
const message = (
  steps: ReasoningSteps[],
  tool_calls: ToolCall[] = []
): PlaygroundChatMessage => ({
  role: 'agent',
  content: 'ok',
  created_at: 1,
  tool_calls,
  extra_data: { reasoning_steps: steps }
})

const full: ReasoningSteps = {
  title: 'Entender o pedido',
  action: 'Conferir o contexto da conversa',
  result: 'O contexto cobre o pedido.',
  reasoning: 'Resposta curta.',
  next_action: 'continue',
  confidence: 0.8
}

const stepSummary = (title: string) => screen.getByText(title).closest('summary')

describe('painel de raciocínio', () => {
  it('passo recolhido mostra o chip, o título e a confiança; o corpo abre com o clique', async () => {
    renderWithIntl(<Messages messages={[message([full])]} />)

    const summary = stepSummary('Entender o pedido')!
    expect(within(summary).getByText('Passo 1')).toBeInTheDocument()
    expect(within(summary).getByText('confiança 80%')).toBeInTheDocument()
    const details = summary.closest('details')!
    expect(details).not.toHaveAttribute('open')

    await userEvent.click(summary)

    expect(details).toHaveAttribute('open')
    const labels = within(details)
      .getAllByRole('term')
      .map((term) => term.textContent)
    expect(labels).toEqual(['Ação', 'Resultado', 'Raciocínio', 'Próxima ação'])
    expect(within(details).getByText('Conferir o contexto da conversa')).toBeInTheDocument()
    expect(within(details).getByText('Continuar')).toBeInTheDocument()
  })

  it('só aparecem os campos que vieram, na ordem da spec', () => {
    renderWithIntl(
      <Messages messages={[message([{ title: 'Validar', reasoning: 'Posso responder.' }])]} />
    )

    const details = stepSummary('Validar')!.closest('details')!
    expect(within(details).getAllByRole('term').map((t) => t.textContent)).toEqual(['Raciocínio'])
    expect(within(details).queryByText('Ação')).not.toBeInTheDocument()
    expect(within(details).queryByText(/confiança/)).not.toBeInTheDocument()
  })

  it('passo só com título é uma linha simples, sem details', () => {
    renderWithIntl(<Messages messages={[message([{ title: 'Só o título', confidence: 0.5 }])]} />)

    expect(screen.getByText('Só o título')).toBeInTheDocument()
    expect(screen.getByText('Só o título').closest('details')).toBeNull()
    expect(screen.getByText('confiança 50%')).toBeInTheDocument()
  })

  it.each([
    ['continue', 'Continuar'],
    ['validate', 'Validar'],
    ['final_answer', 'Resposta final'],
    ['reset', 'Recomeçar'],
    ['outra_coisa', 'outra_coisa']
  ])('next_action %s aparece como %s (desconhecido, cru)', async (next_action, label) => {
    renderWithIntl(<Messages messages={[message([{ title: 'Passo', next_action }])]} />)

    await userEvent.click(stepSummary('Passo')!)

    expect(screen.getByRole('definition')).toHaveTextContent(label)
  })

  it('confiança vira porcentagem inteira', () => {
    renderWithIntl(
      <Messages messages={[message([{ title: 'A', confidence: 0.857 }, { title: 'B', confidence: 1 }])]} />
    )

    expect(screen.getByText('confiança 86%')).toBeInTheDocument()
    expect(screen.getByText('confiança 100%')).toBeInTheDocument()
  })

  it('em inglês: rótulos e confiança traduzidos', async () => {
    renderWithIntl(<Messages messages={[message([full])]} />, { locale: 'en' })

    expect(screen.getByText('confidence 80%')).toBeInTheDocument()
    await userEvent.click(stepSummary('Entender o pedido')!)
    expect(screen.getByText('Next action')).toBeInTheDocument()
    expect(screen.getByText('Continue')).toBeInTheDocument()
  })

  it('a lista anuncia os passos que entram (aria-live)', () => {
    renderWithIntl(<Messages messages={[message([full])]} />)

    const list = screen.getByRole('list', { name: 'Raciocínio' })
    expect(list).toHaveAttribute('aria-live', 'polite')
    expect(list).toHaveAttribute('aria-relevant', 'additions')
  })

  it('sem passos, o painel não aparece', () => {
    renderWithIntl(<Messages messages={[message([])]} />)

    expect(screen.queryByText('Raciocínio')).not.toBeInTheDocument()
  })
})
