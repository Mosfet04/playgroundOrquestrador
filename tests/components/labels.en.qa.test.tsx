import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { beforeEach, describe, expect, it } from 'vitest'

import { GettingStarted } from '@/components/management/GettingStarted'
import { ProviderModel } from '@/components/management/common/ProviderModel'
import { ModeSelector } from '@/components/playground/Sidebar/ModeSelector'
import { usePlaygroundStore } from '@/store'

import { IntlProvider, renderWithIntl } from '../helpers/intl'

// QA1-11, EN sem regressão: os textos novos (Undo, aviso do passo, dicas da aba
// desabilitada, rótulos de provedor) existem em inglês e nenhum cai na chave crua.

const initialStoreState = usePlaygroundStore.getState()

beforeEach(() => {
  usePlaygroundStore.setState(initialStoreState, true)
})

describe('QA1-11 em inglês', () => {
  it('Início: "Undo" e o aviso do passo', async () => {
    const user = userEvent.setup()
    renderWithIntl(<GettingStarted />, { locale: 'en' })
    const first = screen.getAllByRole('group')[0]

    expect(within(first).getByRole('status')).toHaveTextContent('Step 1: pending')
    await user.click(within(first).getByRole('button', { name: 'Mark as done' }))

    expect(within(first).getByRole('button', { name: 'Undo' })).toHaveFocus()
    expect(within(first).getByRole('status')).toHaveTextContent('Step 1: done')
  })

  it.each([
    [{ agents: [{ value: 'a', label: 'A', model: { provider: 'x' } }] }, 'Team', 'Create a team first'],
    [{ teams: [{ value: 't', label: 'T', model: { provider: 'x' }, storage: true }] }, 'Agent', 'Create an agent first']
  ])('aba desabilitada %# explica o motivo em inglês (sr-only e tooltip no foco)', async (state, tab, hint) => {
    const user = userEvent.setup()
    usePlaygroundStore.setState(state)
    render(
      <IntlProvider locale="en">
        <NuqsTestingAdapter>
          <p id="label">Chat with</p>
          <ModeSelector labelledBy="label" />
        </NuqsTestingAdapter>
      </IntlProvider>
    )
    const button = within(screen.getByRole('group', { name: 'Chat with' })).getByRole('button', { name: tab })

    expect(button).toHaveAttribute('aria-disabled', 'true')
    const describedBy = button.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(hint)
    // Foco por teclado: Tab até o botão (a ordem de Tab inclui o desabilitado).
    for (let i = 0; i < 3 && document.activeElement !== button; i++) await user.tab()
    expect(button).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent(hint)
  })

  it.each([
    ['gemini', 'Google Gemini'],
    ['azureopenai', 'Azure OpenAI'],
    ['openai_compatible', 'OpenAI-compatible']
  ])('rótulo de %s em inglês', (raw, label) => {
    renderWithIntl(<ProviderModel provider={raw} model="m" />, { locale: 'en' })
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText(/providers\./)).toBeNull()
  })
})
